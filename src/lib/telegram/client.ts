import { redactToken, splitMessage } from "@/lib/telegram/parse";

export type TelegramErrorCode =
  | "invalid_token"
  | "blocked"
  | "chat_not_found"
  | "bad_request"
  | "conflict"
  | "rate_limited"
  | "timeout"
  | "network"
  | "unknown";

export type TelegramResult<T> = { ok: true; result: T } | { ok: false; code: TelegramErrorCode; error: string; retryAfter?: number };

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const userMessages: Record<TelegramErrorCode, string> = {
  invalid_token: "Telegram rechazó el token. Revisa que lo copiaste completo de BotFather o genera uno nuevo con /token.",
  blocked: "El contacto bloqueó al bot o lo sacó del chat.",
  chat_not_found: "Ese chat no existe o nunca inició el bot.",
  bad_request: "Telegram no aceptó la solicitud.",
  conflict: "Otro servicio está leyendo este bot (webhook o getUpdates). Desconéctalo de ese servicio y vuelve a verificar.",
  rate_limited: "Telegram pidió esperar antes de enviar más mensajes.",
  timeout: "Telegram tardó demasiado en responder.",
  network: "No se pudo contactar a Telegram.",
  unknown: "Telegram devolvió un error inesperado.",
};

export function classifyTelegramError(status: number, description: string): TelegramErrorCode {
  const text = description.toLowerCase();
  if (status === 401 || status === 404) return "invalid_token";
  if (status === 403 || text.includes("blocked") || text.includes("kicked") || text.includes("deactivated")) return "blocked";
  if (status === 429) return "rate_limited";
  if (status === 409) return "conflict";
  if (status === 400 && (text.includes("chat not found") || text.includes("peer_id_invalid") || text.includes("user not found"))) {
    return "chat_not_found";
  }
  if (status === 400) return "bad_request";
  return "unknown";
}

export function telegramUserError(code: TelegramErrorCode) {
  return userMessages[code];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class TelegramClient {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly base = process.env.TELEGRAM_API_BASE_URL?.trim() || "https://api.telegram.org",
  ) {}

  async call<T>(method: string, body: Record<string, unknown> = {}, attempt = 0): Promise<TelegramResult<T>> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.base}/bot${this.token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
    } catch (error) {
      const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      return { ok: false, code: timeout ? "timeout" : "network", error: userMessages[timeout ? "timeout" : "network"] };
    }

    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      result?: T;
      description?: string;
      error_code?: number;
      parameters?: { retry_after?: number };
    } | null;
    if (payload?.ok) return { ok: true, result: payload.result as T };

    const status = payload?.error_code ?? response.status;
    const code = classifyTelegramError(status, redactToken(payload?.description ?? ""));
    const retryAfter = payload?.parameters?.retry_after;
    if (code === "rate_limited" && attempt < 2 && typeof retryAfter === "number" && retryAfter <= 5) {
      await sleep(retryAfter * 1000);
      return this.call<T>(method, body, attempt + 1);
    }
    return { ok: false, code, error: userMessages[code], ...(retryAfter ? { retryAfter } : {}) };
  }

  getMe() {
    return this.call<{ id: number; is_bot: boolean; username?: string; first_name: string }>("getMe");
  }

  setWebhook(url: string, secretToken: string) {
    return this.call<boolean>("setWebhook", {
      url,
      secret_token: secretToken,
      allowed_updates: ["message", "edited_message", "callback_query", "my_chat_member"],
      drop_pending_updates: true,
      max_connections: 20,
    });
  }

  deleteWebhook() {
    return this.call<boolean>("deleteWebhook", { drop_pending_updates: false });
  }

  getWebhookInfo() {
    return this.call<{ url: string; pending_update_count: number; last_error_date?: number; last_error_message?: string }>(
      "getWebhookInfo",
    );
  }

  answerCallback(callbackId: string, text?: string) {
    return this.call<boolean>("answerCallbackQuery", { callback_query_id: callbackId, ...(text ? { text: text.slice(0, 190) } : {}) });
  }

  editButtons(chatId: string, messageId: number) {
    return this.call<unknown>("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });
  }

  sendChatAction(chatId: string) {
    return this.call<boolean>("sendChatAction", { chat_id: chatId, action: "typing" });
  }

  /** Texto plano, dividido en trozos de 4096. Los botones van en el último trozo. */
  async sendText(
    chatId: string,
    text: string,
    options: { replyTo?: number; buttons?: { text: string; data?: string; url?: string }[][] } = {},
  ): Promise<TelegramResult<{ messageIds: number[] }>> {
    const chunks = splitMessage(text);
    if (!chunks.length) return { ok: false, code: "bad_request", error: "El mensaje está vacío." };
    const messageIds: number[] = [];
    for (const [index, chunk] of chunks.entries()) {
      const last = index === chunks.length - 1;
      const sent = await this.call<{ message_id: number }>("sendMessage", {
        chat_id: chatId,
        text: chunk,
        link_preview_options: { is_disabled: false },
        ...(index === 0 && options.replyTo ? { reply_parameters: { message_id: options.replyTo, allow_sending_without_reply: true } } : {}),
        ...(last && options.buttons?.length
          ? {
              reply_markup: {
                inline_keyboard: options.buttons.map((row) =>
                  row.map((button) => (button.url ? { text: button.text, url: button.url } : { text: button.text, callback_data: button.data })),
                ),
              },
            }
          : {}),
      });
      if (!sent.ok) return messageIds.length ? { ok: true, result: { messageIds } } : sent;
      messageIds.push(sent.result.message_id);
    }
    return { ok: true, result: { messageIds } };
  }
}
