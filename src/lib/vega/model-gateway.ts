/**
 * Puerta única de modelos de Vega y del generador.
 *
 * - Con Vercel AI Gateway activo (ver `gatewayMode`): una petición al Gateway con el modelo del
 *   nivel («fuerte» o «rápido») y sus respaldos de otros proveedores. Si el Gateway entero falla,
 *   se intenta la ruta anterior (Gemini directo y luego OpenRouter) si tiene clave.
 * - Sin Gateway: Gemini y, si falla (error, límite de uso, tiempo agotado o respuesta vacía),
 *   OpenRouter. Sin OPENROUTER_API_KEY ese respaldo queda apagado.
 *
 * Si nadie responde, el socio solo ve `saturatedMessage`; el detalle del proveedor va a los logs.
 */
import { geminiCredentials } from "@/lib/ai/models";
import { openGatewayStream } from "@/lib/ai/gateway";
import { gatewayMode, orderForInputs, saturatedMessage, tierModels, unconfiguredMessage, type ModelTier } from "@/lib/ai/models";
import { providerError, readJson } from "@/lib/ai/providers";
import {
  openGeminiStream,
  type FunctionDeclaration,
  type GenerationOptions,
  type GeminiContent,
  type GeminiPart,
  type StreamOptions,
} from "@/lib/vega/gemini-stream";
import type { ModelProvider, ModelUsage } from "@/lib/vega/usage";
import { fromOpenRouterResponse, toOpenRouterMessages, type OpenRouterResponse } from "@/lib/ai/chat-format";

export { fromOpenRouterResponse, toOpenRouterMessages } from "@/lib/ai/chat-format";

export const defaultOpenRouterModel = "google/gemini-2.5-flash";
/** Si el modelo no manda nada en este tiempo, se pasa al respaldo. */
const firstPartTimeoutMs = 20_000;
/** Los modelos del Gateway razonan antes de escribir: se les da más margen para la primera parte. */
export const gatewayFirstPartTimeoutMs = 30_000;

export type ModelStream = {
  ok: true;
  provider: ModelProvider;
  model: string;
  usage: ModelUsage;
  parts: AsyncIterable<GeminiPart>;
  /** true si se cortó por tiempo antes de terminar. */
  state: { truncated: boolean; fallbackReason: string | null };
};
/** `error` siempre es un texto apto para el socio; `detail` (solo logs) trae lo que dijo el proveedor. */
export type ModelFailure = { ok: false; status: number; error: string; detail?: string };

type Opener = (
  system: string,
  contents: GeminiContent[],
  tools: FunctionDeclaration[],
  options: StreamOptions,
) => Promise<
  | { ok: true; provider: ModelProvider; model: string; usage: ModelUsage; parts: AsyncIterable<GeminiPart> }
  | { ok: false; status: number; error: string }
>;

/** Modelos a usar en lugar de los configurados en la ruta Gemini (ahorro cerca del tope, generador). */
export type ModelOverride = { gemini: string; openrouter: string };

export type GatewayDeps = {
  primary: Opener;
  fallback: Opener | null;
  /** Más respaldos después de `fallback`, en orden. */
  more?: Opener[];
  firstPartTimeoutMs?: number;
};

export function openRouterConfig(env: Record<string, string | undefined> = process.env) {
  const apiKey = env.OPENROUTER_API_KEY?.trim() ?? "";
  const disabled = ["off", "false", "0"].includes(env.VEGA_FALLBACK?.trim().toLowerCase() ?? "");
  return { apiKey: disabled ? "" : apiKey, model: env.OPENROUTER_MODEL?.trim() || defaultOpenRouterModel };
}

function hasPdf(contents: GeminiContent[]) {
  return contents.some((content) => content.parts.some((part) => part.inlineData?.mimeType === "application/pdf"));
}

/** Openers en orden según la configuración: Gateway (si está activo) y luego Gemini y OpenRouter. */
export function defaultDeps(
  input: { tier: ModelTier; contents: GeminiContent[]; models: ModelOverride | null },
  env: Record<string, string | undefined> = process.env,
): GatewayDeps {
  const { apiKey, model } = openRouterConfig(env);
  const override = input.models;
  const gemini: Opener = override ? (s, c, t, o) => openGeminiStream(s, c, t, { ...o, model: override.gemini }) : openGeminiStream;
  const openrouter: Opener | null = apiKey
    ? (s, c, t, o) => openOpenRouter(apiKey, override?.openrouter || o.model?.trim() || model, s, c, t, o)
    : null;

  const mode = gatewayMode(env);
  if (!mode.enabled) return { primary: gemini, fallback: openrouter };

  const models = orderForInputs(tierModels(input.tier, env), hasPdf(input.contents));
  const gateway: Opener = (s, c, t, o) => openGatewayStream(mode, models, s, c, t, o);
  const legacy = [geminiCredentials().apiKey ? gemini : null, openrouter].filter((opener): opener is Opener => Boolean(opener));
  return { primary: gateway, fallback: legacy[0] ?? null, more: legacy.slice(1), firstPartTimeoutMs: gatewayFirstPartTimeoutMs };
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
 * Abre una respuesta del modelo con un tiempo máximo (`timeoutMs`). Si el proveedor falla antes de
 * mandar la primera parte (cuota, 429, 5xx, red, tiempo o respuesta vacía), prueba el siguiente.
 * `tier` elige el nivel en AI Gateway; `models` solo cambia los modelos de la ruta Gemini.
 */
export async function openVegaStream(
  system: string,
  contents: GeminiContent[],
  tools: FunctionDeclaration[],
  options: { timeoutMs: number; deps?: GatewayDeps; models?: ModelOverride | null; generation?: GenerationOptions; tier?: ModelTier; label?: string },
): Promise<ModelStream | ModelFailure> {
  const deps = options.deps ?? defaultDeps({ tier: options.tier ?? "fuerte", contents, models: options.models ?? null });
  const openers = [deps.primary, ...(deps.fallback ? [deps.fallback] : []), ...(deps.more ?? [])];
  const startedAt = Date.now();
  const failures: { status: number; error: string }[] = [];

  for (const [index, open] of openers.entries()) {
    const left = options.timeoutMs - (Date.now() - startedAt);
    if (index > 0 && left < 3_000) break;
    const firstMs = index === 0 ? (deps.firstPartTimeoutMs ?? firstPartTimeoutMs) : left;
    const result = await attempt(open, system, contents, tools, left, firstMs, options.generation);
    if (result.ok) {
      if (failures.length) {
        const previous = failures[failures.length - 1];
        result.state.fallbackReason = previous.status ? `status ${previous.status}` : previous.error;
      }
      return result;
    }
    failures.push({ status: result.status, error: result.error });
    // Solo en logs del servidor: estado y texto del proveedor (nunca claves ni el prompt).
    console.warn("[Vega models] falló un proveedor", {
      label: options.label ?? "vega",
      tier: options.tier ?? "fuerte",
      attempt: index + 1,
      of: openers.length,
      status: result.status,
      detail: result.error.slice(0, 300),
    });
  }

  const first = failures[0] ?? { status: 0, error: unconfiguredMessage };
  const last = failures[failures.length - 1] ?? first;
  const unconfigured = failures.length > 0 && failures.every((failure) => failure.error === unconfiguredMessage);
  return {
    ok: false,
    status: last.status,
    error: unconfigured ? unconfiguredMessage : saturatedMessage,
    detail: failures.map((failure) => `${failure.status || "-"}: ${failure.error}`).join(" | ").slice(0, 600),
  };
}

async function attempt(
  open: Opener,
  system: string,
  contents: GeminiContent[],
  tools: FunctionDeclaration[],
  timeoutMs: number,
  firstMs: number,
  generation?: GenerationOptions,
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
    opened = await withTimeout(open(system, contents, tools, { signal: controller.signal, ...(generation ? { generation } : {}) }), Math.min(firstMs, timeoutMs));
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
        temperature: options.generation?.temperature ?? 0.6,
        max_tokens: options.generation?.maxOutputTokens ?? 4096,
        ...(options.generation?.json ? { response_format: { type: "json_object" } } : {}),
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
