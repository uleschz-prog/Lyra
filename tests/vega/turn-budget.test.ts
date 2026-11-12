import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GeminiPart } from "@/lib/vega/gemini-stream";
import type { ModelStream } from "@/lib/vega/model-gateway";

const db = vi.hoisted(() => ({
  messages: [] as { content: string; meta: Record<string, unknown> }[],
}));
const openVegaStream = vi.hoisted(() => vi.fn());
const runVegaTool = vi.hoisted(() => vi.fn());
const refundCharge = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    vegaMessage: {
      create: async ({ data }: { data: { content: string; meta: Record<string, unknown> } }) => {
        db.messages.push(data);
        return data;
      },
    },
    vegaConversation: { update: async () => ({}) },
    vegaAction: { create: async () => ({ id: "a1" }), update: async () => null },
  }),
}));
vi.mock("@/lib/credits", () => ({
  creditPrices: { vegaMessage: 1, vegaTool: 2 },
  chargeCredits: async () => ({ ok: true, duplicate: false, chargeId: "tool-charge", balance: 10 }),
  refundCharge,
  currentCredits: async () => 10,
}));
vi.mock("@/lib/vega/model-gateway", () => ({ openVegaStream }));
vi.mock("@/lib/vega/tools", () => ({
  freeTools: new Set(["recordar"]),
  runVegaTool,
  vegaTools: () => [],
  executeVegaAction: vi.fn(),
}));
vi.mock("@/lib/vega/autonomy", () => ({ evaluateAutonomy: vi.fn(), autonomyPrompt: async () => "" }));
vi.mock("@/lib/ai/composio", () => ({ composioConfigured: () => false }));
vi.mock("@/lib/ai/composio-user", () => ({ userConnections: vi.fn() }));
vi.mock("@/lib/vega/summary", () => ({ HISTORY: 24, SUMMARY_SLACK: 8, scheduleSummary: vi.fn(), summaryContext: () => "" }));

const { runVegaTurn } = await import("@/lib/vega/turn");

function stream(...parts: GeminiPart[]): ModelStream {
  return {
    ok: true,
    provider: "gemini",
    model: "gemini-2.5-flash",
    usage: { provider: "gemini", model: "gemini-2.5-flash", inputTokens: 100, outputTokens: 10, reportedCostUsd: null },
    parts: (async function* () {
      yield* parts;
    })(),
    state: { truncated: false, fallbackReason: null },
  };
}

function turn(first: ModelStream, startedAt = Date.now()) {
  return {
    userId: "u1",
    chatId: "c1",
    chargeId: "msg-charge",
    chargeKey: "vega:u1:r1",
    balance: 10,
    model: "gemini-2.5-flash",
    system: "sys",
    tools: [],
    contents: [{ role: "user" as const, parts: [{ text: "hola" }] }],
    startedAt,
    first,
  };
}

const toolCall = (name = "recordar"): GeminiPart => ({ functionCall: { name, args: {} } });

beforeEach(() => {
  db.messages.length = 0;
  openVegaStream.mockReset();
  runVegaTool.mockReset();
  runVegaTool.mockResolvedValue({ kind: "result", status: "Guardado.", response: { ok: true } });
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  delete process.env.VEGA_MAX_STEPS;
  delete process.env.VEGA_TIME_BUDGET_MS;
});

describe("ciclo del turno de Vega", () => {
  it("encadena más de 4 pasos de herramientas con el límite nuevo", async () => {
    for (let i = 0; i < 5; i += 1) openVegaStream.mockResolvedValueOnce(stream(toolCall()));
    openVegaStream.mockResolvedValueOnce(stream({ text: "Terminé." }));
    const result = await runVegaTurn(turn(stream(toolCall())), () => undefined);
    expect(runVegaTool).toHaveBeenCalledTimes(6);
    expect(result.content).toBe("Terminé.");
    expect(result.stopReason).toBeNull();
    expect(result.usage.calls).toBe(7);
  });

  it("se detiene en VEGA_MAX_STEPS y avisa que puede continuar", async () => {
    process.env.VEGA_MAX_STEPS = "2";
    openVegaStream.mockResolvedValue(stream({ text: "Sigo buscando." }, toolCall()));
    const result = await runVegaTurn(turn(stream({ text: "Voy." }, toolCall())), () => undefined);
    expect(openVegaStream).toHaveBeenCalledTimes(1);
    expect(runVegaTool).toHaveBeenCalledTimes(1);
    expect(result.stopReason).toBe("steps");
    expect(result.content).toContain("Escribe «continúa»");
    expect(db.messages[0].meta).toMatchObject({ partial: true, stopReason: "steps" });
    expect(refundCharge).not.toHaveBeenCalledWith("msg-charge", expect.anything());
  });

  it("no ejecuta más herramientas si ya no queda tiempo", async () => {
    const result = await runVegaTurn(turn(stream({ text: "Reviso tu agenda." }, toolCall()), Date.now() - 40_000), () => undefined);
    expect(runVegaTool).not.toHaveBeenCalled();
    expect(openVegaStream).not.toHaveBeenCalled();
    expect(result.stopReason).toBe("time");
    expect(result.content).toContain("Se me acabó el tiempo");
  });

  it("guarda la respuesta parcial cuando el modelo se corta por tiempo", async () => {
    const cut = stream({ text: "Parte de la respuesta" });
    cut.state.truncated = true;
    const result = await runVegaTurn(turn(cut), () => undefined);
    expect(result.content).toMatch(/^Parte de la respuesta\n\n\(Se me acabó el tiempo/);
    expect(db.messages[0].meta).toMatchObject({ partial: true, stopReason: "time" });
  });
});
