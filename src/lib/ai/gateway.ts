/**
 * Vercel AI Gateway por su API de Chat Completions (compatible con OpenAI), en streaming SSE.
 * Docs: https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions
 *
 * Una sola petición lleva el modelo principal y sus respaldos en `providerOptions.gateway.models`
 * (https://vercel.com/docs/ai-gateway/models-and-providers/model-fallbacks): si un proveedor falla
 * por cuota, 429, 5xx o caída, el propio Gateway prueba el siguiente modelo.
 */
import { toChatMessages } from "@/lib/ai/chat-format";
import type { GatewayMode } from "@/lib/ai/models";
import { providerError, readJson } from "@/lib/ai/providers";
import type { FunctionDeclaration, GeminiContent, GeminiPart, StreamOptions } from "@/lib/vega/gemini-stream";
import type { ModelUsage } from "@/lib/vega/usage";

export const gatewayBaseUrl = "https://ai-gateway.vercel.sh/v1";

export type GatewayAuth = Extract<GatewayMode, { enabled: true }>;
export type GatewayOpenResult =
  | { ok: true; provider: "gateway"; model: string; usage: ModelUsage; parts: AsyncIterable<GeminiPart> }
  | { ok: false; status: number; error: string };

/** Token para la cabecera Authorization: la clave, o el OIDC vigente de la función en Vercel (se pide en cada llamada). */
export async function gatewayToken(auth: GatewayAuth): Promise<string | null> {
  if (auth.auth === "key") return auth.apiKey;
  try {
    const { getVercelOidcToken } = await import("@vercel/oidc");
    return (await getVercelOidcToken()) || null;
  } catch {
    return null;
  }
}

/**
 * Esfuerzo de razonamiento (el Gateway lo adapta a cada proveedor). Bajo por defecto para que chat y
 * generador quepan en sus tiempos (Vercel Hobby: 60 s por función); medio solo con presupuesto grande.
 */
export function reasoningEffort(options: StreamOptions) {
  const budget = options.generation?.thinkingBudget;
  return budget !== undefined && budget >= 4096 ? "medium" : "low";
}

export function gatewayBody(models: string[], system: string, contents: GeminiContent[], tools: FunctionDeclaration[], options: StreamOptions) {
  const [model, ...fallbacks] = models;
  return {
    model,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: options.generation?.maxOutputTokens ?? 4096,
    reasoning: { effort: reasoningEffort(options) },
    ...(options.generation?.json ? { response_format: { type: "json_object" } } : {}),
    messages: toChatMessages(system, contents),
    ...(tools.length ? { tools: tools.map((tool) => ({ type: "function", function: tool })), tool_choice: "auto" } : {}),
    providerOptions: { gateway: { ...(fallbacks.length ? { models: fallbacks } : {}), caching: "auto" } },
  };
}

type Chunk = {
  model?: string;
  error?: unknown;
  choices?: { delta?: { content?: string | null; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number | string } | null;
};

function readCost(value: unknown) {
  const cost = typeof value === "string" ? Number.parseFloat(value) : value;
  return typeof cost === "number" && Number.isFinite(cost) && cost >= 0 ? cost : null;
}

/** Convierte el SSE de Chat Completions en partes estilo Gemini (texto al vuelo; llamadas al final). */
export async function* gatewayParts(body: ReadableStream<Uint8Array>, usage: ModelUsage, promptChars = 0): AsyncGenerator<GeminiPart> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const calls = new Map<number, { name: string; args: string }>();
  let buffer = "";
  let done = false;
  let outChars = 0;

  function* handle(line: string): Generator<GeminiPart> {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data) return;
    if (data === "[DONE]") {
      done = true;
      return;
    }
    let chunk: Chunk;
    try {
      chunk = JSON.parse(data) as Chunk;
    } catch {
      return;
    }
    if (chunk.error) throw new Error(`gateway stream: ${providerError({ error: chunk.error }, "error")}`);
    if (typeof chunk.model === "string" && chunk.model) usage.model = chunk.model;
    if (chunk.usage) {
      usage.inputTokens = chunk.usage.prompt_tokens ?? usage.inputTokens;
      usage.outputTokens = chunk.usage.completion_tokens ?? usage.outputTokens;
      usage.reportedCostUsd = readCost(chunk.usage.cost) ?? usage.reportedCostUsd;
    }
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) return;
    if (typeof delta.content === "string" && delta.content) {
      outChars += delta.content.length;
      yield { text: delta.content };
    }
    for (const call of delta.tool_calls ?? []) {
      const index = call.index ?? 0;
      const entry = calls.get(index) ?? { name: "", args: "" };
      if (call.function?.name) entry.name += call.function.name;
      if (call.function?.arguments) {
        entry.args += call.function.arguments;
        outChars += call.function.arguments.length;
      }
      calls.set(index, entry);
    }
  }

  try {
    while (!done) {
      const { done: ended, value } = await reader.read();
      if (ended) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        yield* handle(line);
      }
    }
    if (!done && buffer.trim()) yield* handle(buffer.trim());
  } finally {
    reader.releaseLock?.();
    // Si el stream no trajo uso, se estima (~4 caracteres por token) para que el tope de costo no se quede corto.
    if (!usage.inputTokens && !usage.outputTokens && usage.reportedCostUsd === null) {
      usage.inputTokens = Math.ceil(promptChars / 4);
      usage.outputTokens = Math.ceil(outChars / 4);
    }
  }

  for (const [, call] of [...calls.entries()].sort((a, b) => a[0] - b[0])) {
    if (!call.name) continue;
    let args: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(call.args || "{}") as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
    } catch {
      args = {};
    }
    yield { functionCall: { name: call.name, args } };
  }
}

/** Abre la respuesta en AI Gateway. Los errores vuelven con estado; el texto del proveedor solo va a los logs. */
export async function openGatewayStream(
  auth: GatewayAuth,
  models: string[],
  system: string,
  contents: GeminiContent[],
  tools: FunctionDeclaration[],
  options: StreamOptions,
  fetcher: typeof fetch = fetch,
): Promise<GatewayOpenResult> {
  if (!models.length) return { ok: false, status: 0, error: "Sin modelos configurados para AI Gateway." };
  const token = await gatewayToken(auth);
  if (!token) return { ok: false, status: 401, error: "AI Gateway sin credenciales (falta AI_GATEWAY_API_KEY o el token OIDC)." };

  const body = JSON.stringify(gatewayBody(models, system, contents, tools, options));
  let response: Response;
  try {
    response = await fetcher(`${gatewayBaseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body,
      signal: options.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false, status: aborted ? 408 : 0, error: aborted ? "AI Gateway tardó demasiado." : "No se pudo contactar a AI Gateway." };
  }
  if (!response.ok || !response.body) {
    const payload = await readJson(response).catch(() => null);
    return { ok: false, status: response.status, error: providerError(payload, `AI Gateway respondió ${response.status}.`) };
  }
  const usage: ModelUsage = { provider: "gateway", model: models[0], inputTokens: 0, outputTokens: 0, reportedCostUsd: null };
  return { ok: true, provider: "gateway", model: models[0], usage, parts: gatewayParts(response.body, usage, body.replace(/"data:[^"]*"/g, "\"\"").length) };
}
