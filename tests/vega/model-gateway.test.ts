import { describe, expect, it, vi } from "vitest";

import type { GeminiContent, GeminiPart } from "@/lib/vega/gemini-stream";
import {
  fromOpenRouterResponse,
  openOpenRouter,
  openRouterConfig,
  openVegaStream,
  toOpenRouterMessages,
  type GatewayDeps,
} from "@/lib/vega/model-gateway";

const usage = (provider: "gemini" | "openrouter", model: string) => ({
  provider,
  model,
  inputTokens: 10,
  outputTokens: 5,
  reportedCostUsd: null,
});

async function* parts(...items: GeminiPart[]) {
  for (const item of items) yield item;
}

async function collect(iterable: AsyncIterable<GeminiPart>) {
  const out: GeminiPart[] = [];
  for await (const part of iterable) out.push(part);
  return out;
}

const okPrimary: GatewayDeps["primary"] = async () => ({
  ok: true,
  provider: "gemini",
  model: "gemini-2.5-flash",
  usage: usage("gemini", "gemini-2.5-flash"),
  parts: parts({ text: "hola desde gemini" }),
});

const okFallback = vi.fn<NonNullable<GatewayDeps["fallback"]>>(async () => ({
  ok: true,
  provider: "openrouter",
  model: "google/gemini-2.5-flash",
  usage: usage("openrouter", "google/gemini-2.5-flash"),
  parts: parts({ text: "hola desde openrouter" }),
}));

const contents: GeminiContent[] = [{ role: "user", parts: [{ text: "hola" }] }];

describe("puerta de modelos de Vega", () => {
  it("usa Gemini cuando responde bien y no toca el respaldo", async () => {
    okFallback.mockClear();
    const result = await openVegaStream("sys", contents, [], { timeoutMs: 10_000, deps: { primary: okPrimary, fallback: okFallback } });
    expect(result.ok && result.provider).toBe("gemini");
    if (result.ok) expect(await collect(result.parts)).toEqual([{ text: "hola desde gemini" }]);
    expect(okFallback).not.toHaveBeenCalled();
  });

  it("pasa a OpenRouter cuando Gemini responde 429", async () => {
    const result = await openVegaStream("sys", contents, [], {
      timeoutMs: 10_000,
      deps: { primary: async () => ({ ok: false, status: 429, error: "quota" }), fallback: okFallback },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provider).toBe("openrouter");
    expect(result.state.fallbackReason).toBe("status 429");
    expect(await collect(result.parts)).toEqual([{ text: "hola desde openrouter" }]);
  });

  it("pasa a OpenRouter si Gemini lanza un error de red", async () => {
    const result = await openVegaStream("sys", contents, [], {
      timeoutMs: 10_000,
      deps: {
        primary: async () => {
          throw new Error("ECONNRESET");
        },
        fallback: okFallback,
      },
    });
    expect(result.ok && result.provider).toBe("openrouter");
  });

  it("pasa a OpenRouter si Gemini no manda la primera parte a tiempo", async () => {
    let aborted = false;
    const slow: GatewayDeps["primary"] = async (_s, _c, _t, { signal }) => {
      signal?.addEventListener("abort", () => {
        aborted = true;
      });
      return {
        ok: true,
        provider: "gemini",
        model: "gemini-2.5-flash",
        usage: usage("gemini", "gemini-2.5-flash"),
        parts: (async function* () {
          await new Promise((resolve) => setTimeout(resolve, 500));
          yield { text: "tarde" };
        })(),
      };
    };
    const result = await openVegaStream("sys", contents, [], {
      timeoutMs: 10_000,
      deps: { primary: slow, fallback: okFallback, firstPartTimeoutMs: 50 },
    });
    expect(result.ok && result.provider).toBe("openrouter");
    expect(aborted).toBe(true);
  });

  it("pasa a OpenRouter si Gemini devuelve una respuesta vacía", async () => {
    const empty: GatewayDeps["primary"] = async () => ({
      ok: true,
      provider: "gemini",
      model: "gemini-2.5-flash",
      usage: usage("gemini", "gemini-2.5-flash"),
      parts: parts(),
    });
    const result = await openVegaStream("sys", contents, [], { timeoutMs: 10_000, deps: { primary: empty, fallback: okFallback } });
    expect(result.ok && result.provider).toBe("openrouter");
  });

  it("sin respaldo configurado devuelve el error de Gemini", async () => {
    const result = await openVegaStream("sys", contents, [], {
      timeoutMs: 10_000,
      deps: { primary: async () => ({ ok: false, status: 503, error: "caído" }), fallback: null },
    });
    expect(result).toEqual({ ok: false, status: 503, error: "caído" });
  });

  it("si fallan los dos, devuelve el error original", async () => {
    const result = await openVegaStream("sys", contents, [], {
      timeoutMs: 10_000,
      deps: {
        primary: async () => ({ ok: false, status: 500, error: "gemini falló" }),
        fallback: async () => ({ ok: false, status: 502, error: "openrouter falló" }),
      },
    });
    expect(result).toEqual({ ok: false, status: 502, error: "gemini falló" });
  });

  it("marca la respuesta como truncada si se acaba el tiempo a media respuesta", async () => {
    const dribble: GatewayDeps["primary"] = async (_s, _c, _t, { signal }) => ({
      ok: true,
      provider: "gemini",
      model: "gemini-2.5-flash",
      usage: usage("gemini", "gemini-2.5-flash"),
      parts: (async function* () {
        yield { text: "parte 1" };
        await new Promise<void>((_, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted"))));
        yield { text: "nunca" };
      })(),
    });
    const result = await openVegaStream("sys", contents, [], { timeoutMs: 80, deps: { primary: dribble, fallback: null } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await collect(result.parts)).toEqual([{ text: "parte 1" }]);
    expect(result.state.truncated).toBe(true);
  });
});

describe("configuración de OpenRouter", () => {
  it("queda apagado sin clave y usa el modelo por defecto", () => {
    expect(openRouterConfig({})).toEqual({ apiKey: "", model: "google/gemini-2.5-flash" });
  });
  it("respeta OPENROUTER_MODEL y VEGA_FALLBACK=off", () => {
    expect(openRouterConfig({ OPENROUTER_API_KEY: "k", OPENROUTER_MODEL: "openai/gpt-4o-mini" })).toEqual({
      apiKey: "k",
      model: "openai/gpt-4o-mini",
    });
    expect(openRouterConfig({ OPENROUTER_API_KEY: "k", VEGA_FALLBACK: "off" }).apiKey).toBe("");
  });
});

describe("conversión de formato para OpenRouter", () => {
  it("traduce llamadas y respuestas de herramientas con ids emparejados", () => {
    const messages = toOpenRouterMessages("sys", [
      { role: "user", parts: [{ text: "busca algo" }] },
      { role: "model", parts: [{ text: "pienso", thought: true }, { functionCall: { name: "buscar_web", args: { q: "lyra" } } }] },
      { role: "user", parts: [{ functionResponse: { name: "buscar_web", response: { ok: true } } }] },
    ]);
    expect(messages[0]).toEqual({ role: "system", content: "sys" });
    expect(messages[1]).toEqual({ role: "user", content: "busca algo" });
    expect(messages[2]).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [{ id: "call_1", type: "function", function: { name: "buscar_web", arguments: '{"q":"lyra"}' } }],
    });
    expect(messages[3]).toEqual({ role: "tool", tool_call_id: "call_1", content: '{"ok":true}' });
  });

  it("manda imágenes como data URL", () => {
    const messages = toOpenRouterMessages("sys", [
      { role: "user", parts: [{ text: "mira" }, { inlineData: { mimeType: "image/png", data: "AAA" } }] },
    ]);
    expect(messages[1]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "mira" },
        { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } },
      ],
    });
  });

  it("convierte la respuesta en partes de texto y llamadas", () => {
    expect(
      fromOpenRouterResponse({
        choices: [
          { message: { content: "listo", tool_calls: [{ function: { name: "recordar", arguments: '{"dato":"x"}' } }, { function: { name: "ver_tareas", arguments: "no-json" } }] } },
        ],
      }),
    ).toEqual([{ text: "listo" }, { functionCall: { name: "recordar", args: { dato: "x" } } }, { functionCall: { name: "ver_tareas", args: {} } }]);
  });

  it("lee el costo que informa OpenRouter", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ model: "google/gemini-2.5-flash", choices: [{ message: { content: "hola" } }], usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0012 } }), {
        status: 200,
      }),
    );
    const result = await openOpenRouter("k", "google/gemini-2.5-flash", "sys", contents, [], {}, fetcher as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.usage).toEqual({ provider: "openrouter", model: "google/gemini-2.5-flash", inputTokens: 100, outputTokens: 20, reportedCostUsd: 0.0012 });
    expect(await collect(result.parts)).toEqual([{ text: "hola" }]);
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.messages[0]).toEqual({ role: "system", content: "sys" });
  });

  it("devuelve el error de OpenRouter sin lanzar", async () => {
    const fetcher = async () => new Response(JSON.stringify({ error: { message: "sin saldo" } }), { status: 402 });
    const result = await openOpenRouter("k", "m", "sys", contents, [], {}, fetcher as unknown as typeof fetch);
    expect(result).toEqual({ ok: false, status: 402, error: "sin saldo" });
  });
});
