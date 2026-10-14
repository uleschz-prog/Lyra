import { describe, expect, it, vi } from "vitest";

import { plainText, runProspectAgent, type AgentContext } from "@/lib/telegram/agent";
import { classifyTelegramError, TelegramClient, type FetchLike } from "@/lib/telegram/client";
import type { GeminiPart } from "@/lib/vega/gemini-stream";

const TOKEN = "123456789:AAHfakefakefakefakefakefakefakefake1";

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("cliente de Telegram", () => {
  it("clasifica los códigos de error", () => {
    expect(classifyTelegramError(401, "Unauthorized")).toBe("invalid_token");
    expect(classifyTelegramError(404, "Not Found")).toBe("invalid_token");
    expect(classifyTelegramError(403, "Forbidden: bot was blocked by the user")).toBe("blocked");
    expect(classifyTelegramError(400, "Bad Request: chat not found")).toBe("chat_not_found");
    expect(classifyTelegramError(400, "Bad Request: can't parse entities")).toBe("bad_request");
    expect(classifyTelegramError(409, "Conflict: can't use getUpdates method while webhook is active")).toBe("conflict");
    expect(classifyTelegramError(429, "Too Many Requests")).toBe("rate_limited");
  });

  it("rechaza un token inválido sin filtrarlo en el error", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => reply({ ok: false, error_code: 401, description: `Unauthorized ${TOKEN}` }, 401));
    const result = await new TelegramClient(TOKEN, fetchImpl, "https://api.test").getMe();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_token");
      expect(JSON.stringify(result)).not.toContain(TOKEN);
    }
  });

  it("valida el bot con getMe", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => reply({ ok: true, result: { id: 42, is_bot: true, username: "ana_bot", first_name: "Ana" } }));
    const result = await new TelegramClient(TOKEN, fetchImpl, "https://api.test").getMe();
    expect(result).toEqual({ ok: true, result: { id: 42, is_bot: true, username: "ana_bot", first_name: "Ana" } });
  });

  it("respeta retry_after en 429 y reintenta", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(reply({ ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 1 } }, 429))
      .mockResolvedValueOnce(reply({ ok: true, result: { message_id: 9 } }));
    const pending = new TelegramClient(TOKEN, fetchImpl, "https://api.test").sendText("5", "hola");
    await vi.advanceTimersByTimeAsync(1000);
    const result = await pending;
    vi.useRealTimers();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true, result: { messageIds: [9] } });
  });

  it("no espera retry_after largos", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(reply({ ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 60 } }, 429));
    const result = await new TelegramClient(TOKEN, fetchImpl, "https://api.test").sendText("5", "hola");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: false, code: "rate_limited", retryAfter: 60 });
  });

  it("reporta bot bloqueado y chat inexistente", async () => {
    const blocked = vi.fn<FetchLike>().mockResolvedValue(reply({ ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" }, 403));
    expect(await new TelegramClient(TOKEN, blocked, "https://api.test").sendText("5", "hola")).toMatchObject({ ok: false, code: "blocked" });
    const missing = vi.fn<FetchLike>().mockResolvedValue(reply({ ok: false, error_code: 400, description: "Bad Request: chat not found" }, 400));
    expect(await new TelegramClient(TOKEN, missing, "https://api.test").sendText("5", "hola")).toMatchObject({ ok: false, code: "chat_not_found" });
  });

  it("convierte fallas de red en timeout", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockRejectedValue(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
    expect(await new TelegramClient(TOKEN, fetchImpl, "https://api.test").getMe()).toMatchObject({ ok: false, code: "timeout" });
  });

  it("divide textos largos en varios sendMessage en texto plano", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = vi.fn<FetchLike>(async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return reply({ ok: true, result: { message_id: bodies.length } });
    });
    const result = await new TelegramClient(TOKEN, fetchImpl, "https://api.test").sendText("5", "a ".repeat(5000), {
      buttons: [[{ text: "Sí", data: "x" }]],
    });
    expect(result).toEqual({ ok: true, result: { messageIds: [1, 2, 3] } });
    expect(bodies.every((body) => !("parse_mode" in body))).toBe(true);
    expect(bodies.every((body) => String(body.text).length <= 4096)).toBe(true);
    expect(bodies[2].reply_markup).toBeDefined();
    expect(bodies[0].reply_markup).toBeUndefined();
  });
});

const baseContext: AgentContext = {
  ownerName: "Ana",
  instructions: "Vendo Pro a $499.",
  contactName: "Luis",
  campaign: "fb",
  stage: "nuevo",
  notes: null,
  history: [{ direction: "inbound", senderType: "contact", text: "/start fb" }],
  mode: "reply",
};

function fakeGenerate(steps: GeminiPart[][]) {
  let call = 0;
  return vi.fn(async () => {
    const parts = steps[call] ?? [];
    call += 1;
    return {
      ok: true as const,
      model: "test",
      parts: (async function* () {
        yield* parts;
      })(),
    };
  });
}

describe("agente de prospectos", () => {
  it("genera respuesta en texto plano", async () => {
    const generate = fakeGenerate([[{ text: "**Hola Luis**, ¿qué buscas?" }]]);
    const result = await runProspectAgent(baseContext, generate);
    expect(result).toEqual({ ok: true, text: "Hola Luis, ¿qué buscas?", effects: [] });
  });

  it("convierte herramientas en efectos que decide el backend", async () => {
    const generate = fakeGenerate([
      [
        { functionCall: { name: "actualizar_prospecto", args: { etapa: "interesado", intencion: "Quiere Pro" } } },
        { functionCall: { name: "pedir_humano", args: { motivo: "Quiere pagar" } } },
      ],
      [{ text: "Te paso con Ana." }],
    ]);
    const result = await runProspectAgent(baseContext, generate);
    expect(result.ok).toBe(true);
    expect(result.effects).toEqual([
      { type: "lead", stage: "interesado", intent: "Quiere Pro" },
      { type: "handoff", reason: "Quiere pagar" },
    ]);
  });

  it("ignora etapas inventadas por el modelo", async () => {
    const generate = fakeGenerate([[{ functionCall: { name: "actualizar_prospecto", args: { etapa: "millonario" } } }], [{ text: "Ok" }]]);
    const result = await runProspectAgent(baseContext, generate);
    expect(result.effects).toEqual([]);
  });

  it("reporta falla del LLM sin texto", async () => {
    const failing = vi.fn(async () => ({ ok: false as const, error: "caído" }));
    expect(await runProspectAgent(baseContext, failing)).toMatchObject({ ok: false, error: "caído" });
    expect(await runProspectAgent(baseContext, fakeGenerate([[]]))).toMatchObject({ ok: false });
  });

  it("no ofrece herramientas en seguimientos", async () => {
    const generate = fakeGenerate([[{ text: "¿Seguimos?" }]]);
    await runProspectAgent({ ...baseContext, mode: "followup", followupStep: 1 }, generate);
    expect(generate).toHaveBeenCalledWith(expect.any(String), expect.any(Array), []);
  });

  it("limpia markdown", () => {
    expect(plainText("# Título\n**negrita** [sitio](https://a.com)")).toBe("Título\nnegrita sitio: https://a.com");
  });
});
