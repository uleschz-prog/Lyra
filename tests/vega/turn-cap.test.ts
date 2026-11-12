import { describe, expect, it, vi } from "vitest";

import { table } from "./fake-prisma";

const chargeCredits = vi.hoisted(() => vi.fn(async () => ({ ok: true, duplicate: false, chargeId: "c", balance: 10 })));
const openVegaStream = vi.hoisted(() => vi.fn());
const logs = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    vegaAgent: { findFirst: async () => ({ id: "agent1", name: "Vega", specialty: null, instructions: null, isDefault: true }) },
    vegaUsageLog: logs.current,
  }),
}));
vi.mock("@/lib/credits", () => ({ creditPrices: { vegaMessage: 1, vegaTool: 3 }, chargeCredits, refundCharge: vi.fn(), currentCredits: async () => 10 }));
vi.mock("@/lib/vega/model-gateway", () => ({ openVegaStream }));
vi.mock("@/lib/vega/tools", () => ({ freeTools: new Set(), runVegaTool: vi.fn(), vegaTools: () => [], executeVegaAction: vi.fn() }));
vi.mock("@/lib/vega/autonomy", () => ({ evaluateAutonomy: vi.fn(), autonomyPrompt: async () => "" }));
vi.mock("@/lib/ai/composio", () => ({ composioConfigured: () => false }));
vi.mock("@/lib/ai/composio-user", () => ({ userConnections: vi.fn() }));

const { prepareVegaTurn } = await import("@/lib/vega/turn");
const { costMonth } = await import("@/lib/vega/cost-cap");

describe("tope en prepareVegaTurn", () => {
  it("al 100 % responde 429 con mensaje amable, sin cobrar créditos ni llamar al modelo", async () => {
    const usage = table();
    await usage.create({ data: { userId: "u1", month: costMonth(new Date()), costUsd: 0.96 } });
    logs.current = usage;
    const prepared = await prepareVegaTurn(
      { id: "u1", name: "Ule", package: "STARTED", role: "USER" } as never,
      { agentId: "agent1", conversationId: null, message: "hola", requestId: "r1", source: "routine" },
    );
    expect(prepared).toMatchObject({ ok: false, status: 429, capped: true });
    if (!prepared.ok) expect(prepared.error).toMatch(/límite mensual de uso de IA/);
    expect(chargeCredits).not.toHaveBeenCalled();
    expect(openVegaStream).not.toHaveBeenCalled();
  });
});
