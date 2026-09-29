export const TELEGRAM_TEXT_LIMIT = 4096;

export const tokenPattern = /^\d{5,15}:[A-Za-z0-9_-]{30,64}$/;

export type InboundKind = "message" | "edited" | "callback" | "blocked" | "unblocked" | "ignored";

export type Inbound = {
  kind: InboundKind;
  updateId: number;
  chatId: string | null;
  chatType: string | null;
  messageId: number | null;
  from: { id: string; username?: string; firstName?: string; lastName?: string; languageCode?: string } | null;
  text: string;
  hasMedia: boolean;
  command: string | null;
  payload: string | null;
  callbackId: string | null;
  callbackData: string | null;
};

type Json = Record<string, unknown>;

const record = (value: unknown): Json | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null);
const str = (value: unknown, max = 256) => (typeof value === "string" ? value.slice(0, max) : undefined);
const idOf = (value: unknown) => (typeof value === "number" || (typeof value === "string" && /^-?\d+$/.test(value)) ? String(value) : null);

function sender(value: unknown): Inbound["from"] {
  const from = record(value);
  const id = idOf(from?.id);
  if (!from || !id || from.is_bot === true) return null;
  return {
    id,
    username: str(from.username, 64),
    firstName: str(from.first_name, 128),
    lastName: str(from.last_name, 128),
    languageCode: str(from.language_code, 12),
  };
}

/** Separa «/start payload» o «/cmd@bot args». */
export function splitCommand(text: string) {
  const match = text.trim().match(/^\/([A-Za-z0-9_]{1,32})(?:@[A-Za-z0-9_]{3,64})?(?:\s+([\s\S]*))?$/);
  if (!match) return { command: null, payload: null };
  return { command: match[1].toLowerCase(), payload: match[2]?.trim() || null };
}

/** Normaliza un update de Telegram sin confiar en su forma. */
export function parseUpdate(raw: unknown): Inbound | null {
  const update = record(raw);
  const updateId = typeof update?.update_id === "number" ? update.update_id : null;
  if (!update || updateId === null) return null;

  const base: Inbound = {
    kind: "ignored",
    updateId,
    chatId: null,
    chatType: null,
    messageId: null,
    from: null,
    text: "",
    hasMedia: false,
    command: null,
    payload: null,
    callbackId: null,
    callbackData: null,
  };

  const callback = record(update.callback_query);
  if (callback) {
    const message = record(callback.message);
    const chat = record(message?.chat);
    return {
      ...base,
      kind: "callback",
      chatId: idOf(chat?.id),
      chatType: str(chat?.type, 20) ?? null,
      messageId: typeof message?.message_id === "number" ? message.message_id : null,
      from: sender(callback.from),
      callbackId: str(callback.id, 128) ?? null,
      callbackData: str(callback.data, 64) ?? null,
    };
  }

  const member = record(update.my_chat_member);
  if (member) {
    const chat = record(member.chat);
    const status = str(record(member.new_chat_member)?.status, 20);
    return {
      ...base,
      kind: status === "kicked" ? "blocked" : status === "member" ? "unblocked" : "ignored",
      chatId: idOf(chat?.id),
      chatType: str(chat?.type, 20) ?? null,
      from: sender(member.from),
    };
  }

  const edited = record(update.edited_message);
  const message = record(update.message) ?? edited;
  if (!message) return base;
  const chat = record(message.chat);
  const text = (str(message.text, TELEGRAM_TEXT_LIMIT) ?? str(message.caption, 1024) ?? "").trim();
  const { command, payload } = splitCommand(text);
  const hasMedia = ["photo", "video", "voice", "audio", "document", "sticker", "video_note", "location", "contact"].some(
    (key) => key in message,
  );
  return {
    ...base,
    kind: edited ? "edited" : "message",
    chatId: idOf(chat?.id),
    chatType: str(chat?.type, 20) ?? null,
    messageId: typeof message.message_id === "number" ? message.message_id : null,
    from: sender(message.from),
    text,
    hasMedia,
    command,
    payload,
  };
}

/** Telegram limita el parámetro start a 64 caracteres A-Z, a-z, 0-9, _ y -. */
export function sanitizeCampaign(value: unknown) {
  if (typeof value !== "string") return null;
  const clean = value.trim().slice(0, 64);
  return /^[A-Za-z0-9_-]{1,64}$/.test(clean) ? clean : null;
}

export function createTelegramDeepLink(botUsername: string, campaignCode: string) {
  const code = sanitizeCampaign(campaignCode);
  if (!/^[A-Za-z0-9_]{5,64}$/.test(botUsername) || !code) return null;
  return `https://t.me/${botUsername}?start=${code}`;
}

const stopCommands = new Set(["stop", "unsubscribe", "cancelar", "baja"]);
const stopWords = /^(stop|baja|cancelar|unsubscribe|no me escribas( más| mas)?|ya no (me )?escribas|no quiero (recibir )?(más |mas )?mensajes)[\s.!]*$/i;

export function isOptOut(input: Pick<Inbound, "command" | "text">) {
  if (input.command && stopCommands.has(input.command)) return true;
  return stopWords.test(input.text.trim());
}

/** Divide en trozos de hasta 4096 caracteres, prefiriendo cortes en párrafos, líneas o espacios. */
export function splitMessage(text: string, limit = TELEGRAM_TEXT_LIMIT) {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(" "));
    const at = cut > limit * 0.5 ? cut : limit;
    chunks.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export function maskChatId(chatId: string | null | undefined) {
  if (!chatId) return "-";
  return chatId.length <= 4 ? "****" : `${"*".repeat(chatId.length - 4)}${chatId.slice(-4)}`;
}

/** Solo https y dominios públicos; evita que el modelo arme enlaces a hosts internos. */
export function safeButtonUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 512) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
      host.includes(":")
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/** Quita el token de cualquier texto antes de registrarlo o mostrarlo. */
export function redactToken(text: string) {
  return text.replace(/\d{5,15}:[A-Za-z0-9_-]{30,64}/g, "[token]").replace(/bot\d{5,15}:[^/\s]+/g, "bot[token]");
}
