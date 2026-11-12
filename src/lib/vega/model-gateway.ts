/**
 * Puerta de modelos de Vega: usa Gemini y, si falla (error, límite de uso,
 * tiempo agotado o respuesta vacía), repite la llamada con OpenRouter.
 * Sin OPENROUTER_API_KEY el respaldo queda apagado.
 */
import { providerError, readJson } from "@/lib/ai/providers";
import {
  openGeminiStream,
  type FunctionDeclaration,
  type GeminiContent,
  type GeminiPart,
  type StreamOptions,
} from "@/lib/vega/gemini-stream";
import type { ModelUsage } from "@/lib/vega/usage";

export const defaultOpenRouterModel = "google/gemini-2.5-flash";
/** Si Gemini no manda nada en este tiempo, se pasa al respaldo. */
const firstPartTimeoutMs = 20_000;

export type ModelStream = {
  ok: true;
  provider: "gemini" | "openrouter";
  model: string;
  usage: ModelUsage;
  parts: AsyncIterable<GeminiPart>;
  /** true si se cortó por tiempo antes de terminar. */
  state: { truncated: boolean; fallbackReason: string | null };
};
export type ModelFailure = { ok: false; status: number; error: string };

type Opener = (
  system: string,
  contents: GeminiContent[],
  tools: FunctionDeclaration[],
  options: StreamOptions,
) => Promise<
  | { ok: true; provider: "gemini" | "openrouter"; model: string; usage: ModelUsage; parts: AsyncIterable<GeminiPart> }
  | { ok: false; status: number; error: string }
>;

export type GatewayDeps = {
  primary: Opener;
  fallback: Opener | null;
  firstPartTimeoutMs?: number;
};

export function openRouterConfig(env: Record<string, string | undefined> = process.env) {
  const apiKey = env.OPENROUTER_API_KEY?.trim() ?? "";
  const disabled = ["off", "false", "0"].includes(env.VEGA_FALLBACK?.trim().toLowerCase() ?? "");
  return { apiKey: disabled ? "" : apiKey, model: env.OPENROUTER_MODEL?.trim() || defaultOpenRouterModel };
}

function defaultDeps(): GatewayDeps {
  const { apiKey, model } = openRouterConfig();
  return {
    primary: openGeminiStream,
    fallback: apiKey ? (system, contents, tools, options) => openOpenRouter(apiKey, model, system, contents, tools, options) : null,
  };
}

class FirstPartTimeout extends Error {
  name = "FirstPartTimeout";
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new FirstPartTimeout()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Abre una respuesta del modelo con un tiempo máximo (`timeoutMs`). Si el
 * proveedor principal falla antes de mandar la primera parte, prueba el respaldo.
 */
export async function openVegaStream(
  system: string,
  contents: GeminiContent[],
  tools: FunctionDeclaration[],
  options: { timeoutMs: number; deps?: GatewayDeps },
): Promise<ModelStream | ModelFailure> {
  const deps = options.deps ?? defaultDeps();
  const startedAt = Date.now();
  const primary = await attempt(deps.primary, system, contents, tools, options.timeoutMs, deps.firstPartTimeoutMs ?? firstPartTimeoutMs);
  if (primary.ok || !deps.fallback) return primary;

  const left = options.timeoutMs - (Date.now() - startedAt);
  if (left < 3_000) return primary;
  console.warn("[Vega gateway] usando respaldo", { status: primary.status });
  const fallback = await attempt(deps.fallback, system, contents, tools, left, left);
  if (fallback.ok) {
    fallback.state.fallbackReason = primary.status ? `status ${primary.status}` : primary.error;
    return fallback;
  }
  return { ok: false, status: fallback.status, error: primary.error };
}

async function attempt(
  open: Opener,
  system: string,
  contents: GeminiContent[],
  tools: FunctionDeclaration[],
  timeoutMs: number,
  firstMs: number,
): Promise<ModelStream | ModelFailure> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const fail = (status: number, error: string): ModelFailure => {
    clearTimeout(timer);
    controller.abort();
    return { ok: false, status, error };
  };

  let opened: Awaited<ReturnType<Opener>>;
  try {
    opened = await withTimeout(open(system, contents, tools, { signal: controller.signal }), Math.min(firstMs, timeoutMs));
  } catch (error) {
    return fail(408, error instanceof FirstPartTimeout ? "El modelo tardó demasiado." : "No se pudo contactar al modelo.");
  }
  if (!opened.ok) return fail(opened.status, opened.error);

  const iterator = opened.parts[Symbol.asyncIterator]();
  let first: IteratorResult<GeminiPart>;
  try {
    first = await withTimeout(iterator.next(), Math.min(firstMs, timeoutMs));
  } catch (error) {
    return fail(408, error instanceof FirstPartTimeout ? "El modelo tardó demasiado." : "El modelo cortó la respuesta.");
  }
  if (first.done) return fail(502, "El modelo devolvió una respuesta vacía.");

  const state = { truncated: false, fallbackReason: null as string | null };
  async function* rest(): AsyncGenerator<GeminiPart> {
    try {
      yield first.value;
      while (true) {
        const next = await iterator.next();
        if (next.done) break;
        yield next.value;
      }
    } catch (error) {
      // Un corte a media respuesta por el tiempo del turno no es un error:
      // se queda la respuesta parcial y el turno avisa que puede continuar.
      if (controller.signal.aborted) state.truncated = true;
      else throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: true, provider: opened.provider, model: opened.model, usage: opened.usage, parts: rest(), state };
}

/* ---------------------------- OpenRouter ---------------------------- */

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ChatContentPart[] }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

/** Convierte el historial de Gemini al formato de chat de OpenRouter (estilo OpenAI). */
export function toOpenRouterMessages(system: string, contents: GeminiContent[]): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: system }];
  let pending: { id: string; name: string }[] = [];
  let counter = 0;

  for (const content of contents) {
    if (content.role === "model") {
      const text = content.parts
        .filter((part) => part.text && !part.thought)
        .map((part) => part.text)
        .join("");
      const calls = content.parts
        .filter((part) => part.functionCall)
        .map((part) => ({
          id: `call_${(counter += 1)}`,
          type: "function" as const,
          function: { name: part.functionCall!.name, arguments: JSON.stringify(part.functionCall!.args ?? {}) },
        }));
      pending = calls.map((call) => ({ id: call.id, name: call.function.name }));
      messages.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }

    const userParts: ChatContentPart[] = [];
    for (const part of content.parts) {
      if (part.functionResponse) {
        const index = pending.findIndex((call) => call.name === part.functionResponse!.name);
        const match = index >= 0 ? pending.splice(index, 1)[0] : { id: `call_${(counter += 1)}` };
        messages.push({ role: "tool", tool_call_id: match.id, content: JSON.stringify(part.functionResponse.response) });
      } else if (part.text) {
        userParts.push({ type: "text", text: part.text });
      } else if (part.inlineData) {
        const url = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        if (part.inlineData.mimeType.startsWith("image/")) userParts.push({ type: "image_url", image_url: { url } });
        else if (part.inlineData.mimeType === "application/pdf") userParts.push({ type: "file", file: { filename: "adjunto.pdf", file_data: url } });
        else userParts.push({ type: "text", text: `(Adjunto ${part.inlineData.mimeType} no disponible en el modelo de respaldo.)` });
      }
    }
    if (userParts.length === 1 && userParts[0].type === "text") messages.push({ role: "user", content: userParts[0].text });
    else if (userParts.length > 0) messages.push({ role: "user", content: userParts });
  }
  return messages;
}

type OpenRouterResponse = {
  model?: string;
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: { function?: { name?: string; arguments?: string } }[];
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
};

/** Convierte la respuesta de OpenRouter en partes estilo Gemini. */
export function fromOpenRouterResponse(payload: OpenRouterResponse): GeminiPart[] {
  const message = payload.choices?.[0]?.message;
  const parts: GeminiPart[] = [];
  if (typeof message?.content === "string" && message.content) parts.push({ text: message.content });
  for (const call of message?.tool_calls ?? []) {
    const name = call.function?.name;
    if (!name) continue;
    let args: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(call.function?.arguments || "{}") as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
    } catch {
      args = {};
    }
    parts.push({ functionCall: { name, args } });
  }
  return parts;
}

export async function openOpenRouter(
  apiKey: string,
  model: string,
  system: string,
  contents: GeminiContent[],
  tools: FunctionDeclaration[],
  options: StreamOptions,
  fetcher: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await fetcher("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "LYRA Vega",
      },
      body: JSON.stringify({
        model,
        temperature: 0.6,
        max_tokens: 4096,
        messages: toOpenRouterMessages(system, contents),
        ...(tools.length
          ? { tools: tools.map((tool) => ({ type: "function", function: tool })) }
          : {}),
        usage: { include: true },
      }),
      signal: options.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false as const, status: aborted ? 408 : 0, error: aborted ? "OpenRouter tardó demasiado." : "No se pudo contactar a OpenRouter." };
  }
  const payload = (await readJson(response)) as OpenRouterResponse | null;
  if (!response.ok || !payload || typeof payload !== "object") {
    return { ok: false as const, status: response.status, error: providerError(payload, "OpenRouter no pudo responder.") };
  }
  const parts = fromOpenRouterResponse(payload);
  const usage: ModelUsage = {
    provider: "openrouter",
    model: payload.model || model,
    inputTokens: payload.usage?.prompt_tokens ?? 0,
    outputTokens: payload.usage?.completion_tokens ?? 0,
    reportedCostUsd: typeof payload.usage?.cost === "number" ? payload.usage.cost : null,
  };
  async function* stream() {
    yield* parts;
  }
  return { ok: true as const, provider: "openrouter" as const, model: usage.model, usage, parts: stream() };
}
