import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GeminiContent, GeminiPart } from "@/lib/vega/gemini-stream";
import type { ModelStream } from "@/lib/vega/model-gateway";
import { saturatedMessage } from "@/lib/ai/models";

import { table } from "./fake-prisma";

const db = vi.hoisted(() => ({ current: null as unknown }));
const openVegaStream = vi.hoisted(() => vi.fn());
const refundCharge = vi.hoisted(() => vi.fn(async () => undefined));
const runVegaTool = vi.hoisted(() => vi.fn());
const executeVegaAction = vi.hoisted(() => vi.fn(async () => ({ ok: true, message: "Listo." })));
const evaluateAutonomy = vi.hoisted(() => vi.fn(async () => ({ ok: true })));

vi.mock("@/lib/prisma", () => ({ getPrisma: () => db.current }));
vi.mock("@/lib/credits", () => ({
  creditPrices: { vegaMessage: 1, vegaTool: 2 },
  chargeCredits: async () => ({ ok: true, duplicate: false, chargeId: "tool-charge", balance: 10 }),
  refundCharge,
  currentCredits: async () => 10,
}));
vi.mock("@/lib/vega/model-gateway", () => ({ openVegaStream }));
vi.mock("@/lib/vega/tools", () => ({
  freeTools: new Set<string>(),
  runVegaTool,
  vegaTools: () => [],
  executeVegaAction,
  connectDraft: (toolkit: string, reason: string, reconnect = false) => ({ toolkit, label: toolkit === "gmail" ? "Gmail" : toolkit, reason: reason || "hint", reconnect }),
}));
vi.mock("@/lib/vega/autonomy", () => ({ evaluateAutonomy, autonomyPrompt: async () => "" }));
vi.mock("@/lib/ai/composio", () => ({ composioConfigured: () => false }));
vi.mock("@/lib/ai/composio-user", () => ({ userConnections: vi.fn() }));
vi.mock("@/lib/vega/summary", () => ({ HISTORY: 24, SUMMARY_SLACK: 8, scheduleSummary: vi.fn(), summaryContext: () => "" }));

const { runVegaTurn } = await import("@/lib/vega/turn");

function stream(...parts: GeminiPart[]): ModelStream {
  return {
    ok: true,
    provider: "gateway",
    model: "spacexai/grok-4.7",
    usage: { provider: "gateway", model: "anthropic/claude-sonnet-5.5", inputTokens: 10, outputTokens: 5, reportedCostUsd: 0.001 },
    parts: (async function* () {
      yield* parts;
    })(),
    state: { truncated: false, fallbackReason: null },
  };
}

function turn(first: ModelStream, contents: GeminiContent[]) {
  return {
    userId: "u1",
    chatId: "c1",
    chargeId: "msg-charge",
    chargeKey: "vega:u1:r1",
    balance: 10,
    model: "gemini-2.5-flash",
    system: "sys",
    tools: [],
    contents,
    startedAt: Date.now(),
    userMessage: "revisa mi correo",
    first,
  };
}

const call = (name: string): GeminiPart => ({ functionCall: { name, args: {} } });
let actions: ReturnType<typeof table>;

beforeEach(() => {
  actions = table(() => ({ status: "pending", result: null, riskClass: null, fingerprint: null, tainted: false, expiresAt: null }));
  db.current = { vegaAction: actions, vegaMessage: table(), vegaConversation: { update: async () => ({}) } };
  openVegaStream.mockReset();
  refundCharge.mockClear();
  runVegaTool.mockReset();
  executeVegaAction.mockClear();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("turno con modelos del Gateway", () => {
  it("las llamadas a herramientas del Gateway pasan por la política de acciones (enviar queda pendiente)", async () => {
    runVegaTool.mockResolvedValue({ kind: "action", action: "send_email", payload: { to: "ana@x.com", subject: "Hola", body: "Hola" }, summary: "Correo" });
    openVegaStream.mockResolvedValueOnce(stream({ text: "Te dejé el correo listo para confirmar." }));
    const events: { t: string; v: unknown }[] = [];
    const result = await runVegaTurn({ ...turn(stream(call("preparar_correo")), [{ role: "user", parts: [{ text: "manda un correo a ana" }] }]), tier: "rapido" }, (event) =>
      events.push(event as { t: string; v: unknown }),
    );
    expect(result.failed).toBe(false);
    expect(executeVegaAction).not.toHaveBeenCalled();
    expect(actions.rows[0]).toMatchObject({ status: "pending", riskClass: "send" });
    // Tras usar herramientas, el siguiente paso sube al nivel fuerte.
    expect(openVegaStream.mock.calls[0][3]).toMatchObject({ tier: "fuerte" });
    expect(result.usage.providers).toEqual(["gateway:anthropic/claude-sonnet-5.5"]);
  });

  it("cerca del tope, los pasos siguientes se quedan en el nivel rápido", async () => {
    runVegaTool.mockResolvedValue({ kind: "result", status: "Listo", response: { ok: true } });
    openVegaStream.mockResolvedValueOnce(stream({ text: "Listo." }));
    await runVegaTurn({ ...turn(stream(call("ver_memoria")), [{ role: "user", parts: [{ text: "hola" }] }]), tier: "rapido", degraded: true }, () => undefined);
    expect(openVegaStream.mock.calls[0][3]).toMatchObject({ tier: "rapido" });
  });

  it("si todos los modelos fallan a media tarea y no hay texto: aviso amable y reembolso", async () => {
    runVegaTool.mockResolvedValue({ kind: "result", status: "Listo", response: { ok: true } });
    openVegaStream.mockResolvedValueOnce({ ok: false, status: 429, error: saturatedMessage, detail: "429: quota" });
    const events: { t: string; v: unknown }[] = [];
    const result = await runVegaTurn(turn(stream(call("ver_memoria")), [{ role: "user", parts: [{ text: "hola" }] }]), (event) =>
      events.push(event as { t: string; v: unknown }),
    );
    expect(result.failed).toBe(true);
    const error = events.find((event) => event.t === "error");
    expect(error?.v).toBe(`${saturatedMessage} No se descontó el crédito.`);
    expect(JSON.stringify(events)).not.toContain("quota");
    expect(refundCharge).toHaveBeenCalledWith("msg-charge", expect.any(String));
  });
});
