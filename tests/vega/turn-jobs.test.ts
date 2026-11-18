import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GeminiPart } from "@/lib/vega/gemini-stream";
import type { ModelStream } from "@/lib/vega/model-gateway";

const db = vi.hoisted(() => ({
  messages: [] as { content: string; meta: Record<string, unknown> }[],
  usage: [] as Record<string, unknown>[],
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
    vegaUsageLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        db.usage.push(data);
        return { id: "log1" };
      },
      aggregate: async () => ({ _sum: { costUsd: db.usage.reduce((sum, row) => sum + Number(row.costUsd), 0) } }),
    },
  }),
}));
vi.mock("@/lib/credits", () => ({
  creditPrices: { vegaMessage: 1, vegaTool: 2 },
  chargeCredits: async (...args: unknown[]) => {
    chargeSpy(...args);
    return { ok: true, duplicate: false, chargeId: "tool-charge", balance: 10 };
  },
  refundCharge,
  currentCredits: async () => 10,
}));
vi.mock("@/lib/vega/model-gateway", () => ({ openVegaStream }));
const startBackgroundJob = vi.hoisted(() => vi.fn());
const startDelegation = vi.hoisted(() => vi.fn());
const chargeSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/vega/jobs-tool", () => ({
  backgroundJobTool: "trabajo_en_segundo_plano",
  delegateTool: "delegar_a_agente",
  delegateDeclaration: () => ({ name: "delegar_a_agente" }),
  startBackgroundJob,
  startDelegation,
}));
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
    startedJobs: undefined as string[] | undefined,
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


beforeEach(() => {
  db.messages.length = 0;
  db.usage.length = 0;
  openVegaStream.mockReset();
  runVegaTool.mockReset();
  startBackgroundJob.mockReset();
  startDelegation.mockReset();
  chargeSpy.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("Vega v2 · turnos y trabajos en segundo plano", () => {
  it("un paso intermedio no guarda mensaje en la conversación", async () => {
    const result = await runVegaTurn({ ...turn(stream({ text: "Encontré 3 proveedores." })), persistReply: false }, () => undefined);
    expect(result.content).toBe("Encontré 3 proveedores.");
    expect(db.messages).toHaveLength(0);
    expect(refundCharge).not.toHaveBeenCalledWith("msg-charge", expect.anything());
  });

  it("el paso final guarda el mensaje con las tarjetas de pasos anteriores y el trabajo", async () => {
    await runVegaTurn({ ...turn(stream({ text: "Te recomiendo B." })), extraActionIds: ["prev1"], jobId: "job_9" }, () => undefined);
    expect(db.messages).toHaveLength(1);
    expect(db.messages[0].meta).toMatchObject({ actions: ["prev1"], job: "job_9" });
  });

  it("la herramienta de trabajo largo deja el trabajo en cola, muestra la tarjeta y no cobra herramienta", async () => {
    const action = { id: "act_job", kind: "background_job", payload: { job: { jobId: "job_1", title: "Comparar", steps: ["a", "b"] } }, status: "running", result: null };
    startBackgroundJob.mockResolvedValue({ ok: true, jobId: "job_1", title: "Comparar", action, response: { estado: "en_segundo_plano" } });
    openVegaStream.mockResolvedValueOnce(stream({ text: "Listo, empecé a comparar; sigue platicando conmigo." }));
    const events: { t: string }[] = [];
    const current = { ...turn(stream({ functionCall: { name: "trabajo_en_segundo_plano", args: { titulo: "Comparar" } } })), agentId: "agent_1" };
    const result = await runVegaTurn(current, (event) => events.push(event));
    expect(startBackgroundJob).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: "u1", chatId: "c1", agentId: "agent_1" }));
    expect(current.startedJobs).toEqual(["job_1"]);
    expect(events.some((event) => event.t === "action")).toBe(true);
    expect(runVegaTool).not.toHaveBeenCalled();
    expect(chargeSpy).not.toHaveBeenCalled();
    expect(result.actionIds).toEqual(["act_job"]);
    expect(db.messages[0].meta).toMatchObject({ actions: ["act_job"] });
  });

  it("delegar_a_agente pasa la tarea a otro agente, muestra la tarjeta y no cobra herramienta", async () => {
    const action = {
      id: "act_del",
      kind: "background_job",
      payload: { job: { jobId: "job_2", title: "Post", steps: ["Post"], delegate: { agentId: "luna", name: "Luna", avatar: "🦊", conversationId: "c9" } } },
      status: "running",
      result: null,
    };
    startDelegation.mockResolvedValue({ ok: true, jobId: "job_2", title: "Post", action, response: { estado: "delegado" } });
    openVegaStream.mockResolvedValueOnce(stream({ text: "Se lo pasé a Luna." }));
    const current = { ...turn(stream({ functionCall: { name: "delegar_a_agente", args: { agente: "Luna", tarea: "Escribe un post" } } })), agentId: "vega" };
    const result = await runVegaTurn(current, () => undefined);
    expect(startDelegation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: "u1", chatId: "c1", fromAgentId: "vega" }));
    expect(current.startedJobs).toEqual(["job_2"]);
    expect(chargeSpy).not.toHaveBeenCalled();
    expect(runVegaTool).not.toHaveBeenCalled();
    expect(result.actionIds).toEqual(["act_del"]);
  });

  it("las herramientas reciben el alcance del agente que contesta", async () => {
    runVegaTool.mockResolvedValue({ kind: "result", status: "Guardé", response: { ok: true } });
    openVegaStream.mockResolvedValueOnce(stream({ text: "Listo." }));
    const scope = { agentId: "luna", isDefault: false };
    await runVegaTurn({ ...turn(stream({ functionCall: { name: "recordar", args: { dato: "Prefiere WhatsApp" } } })), agentId: "luna", scope }, () => undefined);
    expect(runVegaTool).toHaveBeenCalledWith("u1", "recordar", { dato: "Prefiere WhatsApp" }, { scope });
  });
});
