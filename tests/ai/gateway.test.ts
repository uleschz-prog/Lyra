import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { gatewayBody, openGatewayStream } from "@/lib/ai/gateway";
import { saturatedMessage } from "@/lib/ai/models";
import type { GeminiContent, GeminiPart } from "@/lib/vega/gemini-stream";
import { defaultDeps, openVegaStream } from "@/lib/vega/model-gateway";

const auth = { enabled: true as const, auth: "key" as const, apiKey: "test-key" };
const contents: GeminiContent[] = [{ role: "user", parts: [{ text: "hola" }] }];
const tools = [{ name: "preparar_correo", description: "Prepara un correo", parameters: { type: "object", properties: { para: { type: "string" } } } }];

function sse(...events: unknown[]) {
  const text = events.map((event) => `data: ${typeof event === "string" ? event : JSON.stringify(event)}\n\n`).join("");
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        // En dos pedazos para probar líneas partidas.
        controller.enqueue(bytes.slice(0, 37));
        controller.enqueue(bytes.slice(37));
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

async function collect(iterable: AsyncIterable<GeminiPart>) {
  const out: GeminiPart[] = [];
  for await (const part of iterable) out.push(part);
  return out;
}

describe("petición a AI Gateway", () => {
  it("lleva el principal, los respaldos nativos, herramientas, caché y razonamiento", () => {
    const body = gatewayBody(["spacexai/grok-4.7", "anthropic/claude-sonnet-5.5", "openai/gpt-5.6-terra"], "sys", contents, tools, {
      generation: { maxOutputTokens: 9000, json: true, thinkingBudget: 8192 },
    });
    expect(body.model).toBe("spacexai/grok-4.7");
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBe(9000);
    expect(body.reasoning).toEqual({ effort: "medium" });
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.providerOptions).toEqual({ gateway: { models: ["anthropic/claude-sonnet-5.5", "openai/gpt-5.6-terra"], caching: "auto" } });
    expect(body.tools).toEqual([{ type: "function", function: tools[0] }]);
    expect(body.messages[0]).toEqual({ role: "system", content: "sys" });
    expect("temperature" in body).toBe(false);
  });

  it("chat: esfuerzo bajo y sin response_format", () => {
    const body = gatewayBody(["anthropic/claude-haiku-5.5"], "sys", contents, [], {});
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.response_format).toBeUndefined();
    expect(body.providerOptions).toEqual({ gateway: { caching: "auto" } });
  });
});

describe("stream de AI Gateway", () => {
  it("entrega texto al vuelo, junta llamadas en pedazos y lee modelo, uso y costo", async () => {
    const fetcher = vi.fn(async () =>
      sse(
        { model: "anthropic/claude-sonnet-5.5", choices: [{ delta: { content: "Te " } }] },
        { choices: [{ delta: { content: "ayudo." } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "preparar_correo", arguments: '{"pa' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ra":"ana@x.com"}' } }] } }] },
        { choices: [], usage: { prompt_tokens: 1200, completion_tokens: 80, cost: 0.0032 } },
        "[DONE]",
      ),
    );
    const opened = await openGatewayStream(auth, ["spacexai/grok-4.7", "anthropic/claude-sonnet-5.5"], "sys", contents, tools, {}, fetcher as unknown as typeof fetch);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(await collect(opened.parts)).toEqual([{ text: "Te " }, { text: "ayudo." }, { functionCall: { name: "preparar_correo", args: { para: "ana@x.com" } } }]);
    expect(opened.usage).toEqual({ provider: "gateway", model: "anthropic/claude-sonnet-5.5", inputTokens: 1200, outputTokens: 80, reportedCostUsd: 0.0032 });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ai-gateway.vercel.sh/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
  });

  it("si el stream no trae uso, lo estima para el tope de costo", async () => {
    const fetcher = async () => sse({ choices: [{ delta: { content: "x".repeat(400) } }] }, "[DONE]");
    const opened = await openGatewayStream(auth, ["anthropic/claude-haiku-5.5"], "s".repeat(4000), contents, [], {}, fetcher as unknown as typeof fetch);
    if (!opened.ok) throw new Error("debía abrir");
    await collect(opened.parts);
    expect(opened.usage.outputTokens).toBe(100);
    expect(opened.usage.inputTokens).toBeGreaterThan(1000);
  });

  it("devuelve el estado del Gateway sin lanzar (429, 402)", async () => {
    for (const status of [429, 402]) {
      const fetcher = async () => new Response(JSON.stringify({ error: { message: "You exceeded your current quota" } }), { status });
      const opened = await openGatewayStream(auth, ["spacexai/grok-4.7"], "sys", contents, [], {}, fetcher as unknown as typeof fetch);
      expect(opened).toEqual({ ok: false, status, error: "You exceeded your current quota" });
    }
  });

  it("un error a media respuesta corta el stream", async () => {
    const fetcher = async () => sse({ choices: [{ delta: { content: "Hola" } }] }, { error: { message: "upstream reset" } });
    const opened = await openGatewayStream(auth, ["spacexai/grok-4.7"], "sys", contents, [], {}, fetcher as unknown as typeof fetch);
    if (!opened.ok) throw new Error("debía abrir");
    await expect(collect(opened.parts)).rejects.toThrow(/upstream reset/);
  });
});

describe("capa única con Gateway activo", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    process.env = { ...saved };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sin Gateway, el principal es Gemini y el respaldo OpenRouter (como antes)", () => {
    const deps = defaultDeps({ tier: "fuerte", contents, models: null }, { GEMINI_API_KEY: "g", OPENROUTER_API_KEY: "o" });
    expect(deps.firstPartTimeoutMs).toBeUndefined();
    expect(deps.fallback).not.toBeNull();
    expect(deps.more ?? []).toHaveLength(0);
  });

  it("con Gateway: el nivel elige el modelo y, si el Gateway cae, responde Gemini", async () => {
    process.env = { ...saved, AI_GATEWAY_API_KEY: "test-key", GEMINI_API_KEY: "g", GEMINI_MODEL: "gemini-2.5-flash" };
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.startsWith("https://ai-gateway.vercel.sh")) {
          bodies.push(JSON.parse(String(init.body)));
          return new Response(JSON.stringify({ error: { message: "no credits" } }), { status: 402 });
        }
        return sse({ candidates: [{ content: { parts: [{ text: "hola desde gemini" }] } }] });
      }),
    );
    const result = await openVegaStream("sys", contents, [], { timeoutMs: 20_000, tier: "rapido" });
    expect(bodies[0].model).toBe("anthropic/claude-haiku-5.5");
    expect(result.ok && result.provider).toBe("gemini");
    if (result.ok) {
      expect(await collect(result.parts)).toEqual([{ text: "hola desde gemini" }]);
      expect(result.state.fallbackReason).toBe("status 402");
    }
  });

  it("si nadie responde, el socio solo ve el aviso amable; el texto del proveedor queda en logs", async () => {
    process.env = { ...saved, AI_GATEWAY_API_KEY: "test-key", GEMINI_API_KEY: "g" };
    delete process.env.OPENROUTER_API_KEY;
    const raw = "You exceeded your current quota... generate_content_free_tier_requests, limit: 20, model: gemini-2.5-flash";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: raw } }), { status: 429 })));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await openVegaStream("sys", contents, tools, { timeoutMs: 20_000, tier: "fuerte" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(saturatedMessage);
    expect(result.error).not.toMatch(/quota|gemini/i);
    expect(result.status).toBe(429);
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).toContain("free_tier");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("test-key");
  });

  it("con PDF el Gateway arranca por un modelo que lee PDF", async () => {
    process.env = { ...saved, AI_GATEWAY_API_KEY: "test-key", VEGA_MODEL_FUERTE: "spacexai/grok-4.7" };
    let body: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        body = JSON.parse(String(init.body));
        return sse({ choices: [{ delta: { content: "Leí tu PDF." } }] }, "[DONE]");
      }),
    );
    const withPdf: GeminiContent[] = [{ role: "user", parts: [{ text: "resume" }, { inlineData: { mimeType: "application/pdf", data: "JVBERi0=" } }] }];
    const result = await openVegaStream("sys", withPdf, [], { timeoutMs: 20_000, tier: "fuerte" });
    expect(result.ok).toBe(true);
    expect(body.model).toBe("anthropic/claude-sonnet-5.5");
    expect((body.providerOptions as { gateway: { models: string[] } }).gateway.models).toEqual(["spacexai/grok-4.7", "openai/gpt-5.6-terra"]);
  });
});
