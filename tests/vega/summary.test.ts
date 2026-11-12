import { beforeEach, describe, expect, it, vi } from "vitest";

import { table, tick } from "./fake-prisma";

const db = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => db.current }));

const { HISTORY, SUMMARY_SLACK, maybeSummarizeConversation, planSummary, summaryContext } = await import("@/lib/vega/summary");

let conversations: ReturnType<typeof table>;
let messages: ReturnType<typeof table>;

function seed(count: number) {
  for (let index = 0; index < count; index += 1) {
    messages.rows.push({ id: `m${index}`, conversationId: "c1", role: index % 2 ? "assistant" : "user", content: `mensaje ${index}`, createdAt: tick() });
  }
}

const live = vi.fn(async () => ({ mode: "live" as const, provider: "gemini" as const, model: "gemini-2.5-flash", text: "- Quiere 20 socios\n- Pagó con 4111 1111 1111 1111" }));

beforeEach(() => {
  conversations = table();
  messages = table();
  conversations.rows.push({ id: "c1", summary: null, summaryThrough: null });
  db.current = { vegaConversation: conversations, vegaMessage: messages };
  live.mockClear();
});

describe("resumen de conversaciones largas", () => {
  it("solo se dispara cuando sobran mensajes fuera del historial", () => {
    expect(planSummary(HISTORY + SUMMARY_SLACK)).toEqual({ due: false, take: 0 });
    expect(planSummary(HISTORY + SUMMARY_SLACK + 1)).toEqual({ due: true, take: SUMMARY_SLACK + 1 });
  });

  it("no resume conversaciones cortas", async () => {
    seed(20);
    expect(await maybeSummarizeConversation("c1", live)).toEqual({ summarized: false });
    expect(live).not.toHaveBeenCalled();
  });

  it("resume los mensajes viejos, guarda hasta dónde y oculta datos sensibles", async () => {
    seed(40);
    const result = await maybeSummarizeConversation("c1", live);
    expect(result).toEqual({ summarized: true, messages: 40 - HISTORY });
    const row = conversations.rows[0];
    expect(row.summary).toContain("Quiere 20 socios");
    expect(row.summary).not.toContain("4111");
    expect(row.summaryThrough).toEqual(messages.rows[40 - HISTORY - 1].createdAt);
    const call = live.mock.calls[0] as unknown as [{ user: string }];
    expect(call[0].user).toContain("mensaje 0");
    expect(call[0].user).not.toContain(`mensaje ${40 - HISTORY}`);

    // El siguiente turno no vuelve a resumir hasta que se junten más mensajes.
    expect(await maybeSummarizeConversation("c1", live)).toEqual({ summarized: false });
  });

  it("integra el resumen anterior al resumir de nuevo", async () => {
    seed(40);
    await maybeSummarizeConversation("c1", live);
    seed(SUMMARY_SLACK + 1);
    await maybeSummarizeConversation("c1", live);
    const second = live.mock.calls[1] as unknown as [{ user: string }];
    expect(second[0].user).toContain("Resumen anterior");
  });

  it("si el modelo falla, no guarda nada y no lanza", async () => {
    seed(40);
    const failing = vi.fn(async () => {
      throw new Error("caído");
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await maybeSummarizeConversation("c1", failing as never)).toEqual({ summarized: false });
    expect(conversations.rows[0].summary).toBeNull();
  });

  it("agrega el resumen al contexto solo si existe", () => {
    expect(summaryContext(null)).toBe("");
    expect(summaryContext("- algo")).toContain("Resumen de la parte anterior");
  });
});
