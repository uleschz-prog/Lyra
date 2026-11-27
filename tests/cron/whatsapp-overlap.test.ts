import { describe, expect, it, vi } from "vitest";

type Row = { id: string; status: string; runAt: Date; updatedAt: Date; error?: string | null; sentAt?: Date; waMessageId?: string };

const state = vi.hoisted(() => ({ rows: [] as Row[], sends: [] as string[], messages: [] as unknown[] }));

function matches(row: Row, where: Record<string, unknown>) {
  if (where.id && row.id !== where.id) return false;
  if (where.status && row.status !== where.status) return false;
  const runAt = where.runAt as { lte?: Date } | undefined;
  if (runAt?.lte && !(row.runAt <= runAt.lte)) return false;
  const updatedAt = where.updatedAt as { lt?: Date } | undefined;
  if (updatedAt?.lt && !(row.updatedAt < updatedAt.lt)) return false;
  return true;
}

vi.mock("@/lib/prisma", () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const scheduled = {
    findMany: async ({ where }: { where: Record<string, unknown> }) => {
      await tick();
      return state.rows.filter((row) => matches(row, where)).map(({ id }) => ({ id }));
    },
    // updateMany condicional y atómico, como en Postgres.
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
      await tick();
      const hit = state.rows.filter((row) => matches(row, where));
      hit.forEach((row) => Object.assign(row, data, { updatedAt: new Date() }));
      return { count: hit.length };
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      await tick();
      const row = state.rows.find((item) => item.id === where.id);
      return row
        ? {
            ...row,
            userId: "u1",
            connectionId: "c1",
            chatRowId: "chat1",
            recipientPhone: "5215555555555",
            kind: "text",
            text: "Hola",
            templateName: null,
            language: null,
            variables: null,
            consentConfirmed: true,
            chat: { optedOutAt: null, lastInboundAt: new Date(), consentAt: new Date() },
            connection: { status: "active" },
          }
        : null;
    },
  };
  const db = {
    whatsappScheduledMessage: scheduled,
    whatsappMessage: { create: async ({ data }: { data: unknown }) => void state.messages.push(data) },
    whatsappChat: { update: async () => ({}) },
    vegaWhatsappBlock: { findUnique: async () => null },
    whatsappConnection: { count: async () => 1 },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { getPrisma: () => db };
});

vi.mock("@/lib/whatsapp/meta-business", () => ({
  listMetaWhatsappTemplates: vi.fn(),
  sendMetaWhatsapp: vi.fn(async (_userId: string, phone: string) => {
    state.sends.push(phone);
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { ok: true, waMessageId: `wamid.${state.sends.length}` };
  }),
}));

const { runDueWhatsappMessages } = await import("@/lib/whatsapp/scheduled");

describe("WhatsApp programados: disparos solapados", () => {
  it("dos corridas simultáneas envían cada mensaje una sola vez", async () => {
    const past = new Date(Date.now() - 60_000);
    state.rows = ["m1", "m2", "m3"].map((id) => ({ id, status: "scheduled", runAt: past, updatedAt: past }));
    const [first, second] = await Promise.all([runDueWhatsappMessages(), runDueWhatsappMessages()]);
    expect(state.sends).toHaveLength(3);
    expect(state.messages).toHaveLength(3);
    expect(state.rows.every((row) => row.status === "sent")).toBe(true);
    const sent = (summary: Record<string, number>) => summary.sent ?? 0;
    expect(sent(first) + sent(second)).toBe(3);
  });
});
