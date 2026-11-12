import { beforeEach, describe, expect, it, vi } from "vitest";

import { table } from "./fake-prisma";

const db = vi.hoisted(() => ({ current: null as unknown }));
const execute = vi.hoisted(() => vi.fn(async () => ({ ok: true, message: "Listo." })));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => db.current }));
vi.mock("@/lib/vega/tools", () => ({ executeVegaAction: execute }));
vi.mock("@/lib/vega/autonomy", () => ({ evaluateAutonomy: vi.fn(async () => ({ ok: true })) }));

const { proposeAction } = await import("@/lib/vega/action-flow");
const { decideAction, actionView } = await import("@/lib/vega/decide");
const { expireStaleActions, actionLog } = await import("@/lib/vega/action-store");

const now = new Date("2026-11-12T18:00:00Z");
const HOUR = 3_600_000;
let actions: ReturnType<typeof table>;
let messages: ReturnType<typeof table>;

const allowAll = { autonomy: async () => ({ ok: true }) as const, execute };
const email = { to: "ana@cliente.mx", subject: "Propuesta", body: "Hola Ana, te comparto la propuesta." };
const sheet = { op: "sheet_append", title: "Fila nueva en Prospectos", lines: [], confirm: "Agregar fila", data: { spreadsheetId: "s1", values: ["Ana"] } };

function propose(kind: string, payload: unknown, extra: { tainted?: boolean; userMessage?: string; at?: Date } = {}) {
  return proposeAction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { userId: "u1", chatId: "c1", kind: kind as any, payload: payload as any, tainted: extra.tainted ?? false, userMessage: extra.userMessage ?? "hazlo", now: extra.at ?? now },
    allowAll,
  );
}

beforeEach(() => {
  actions = table(() => ({ status: "pending", result: null, riskClass: null, fingerprint: null, tainted: false, expiresAt: null, decidedAt: null, executedBy: null }));
  messages = table();
  db.current = { vegaAction: actions, vegaMessage: messages };
  execute.mockClear();
  delete process.env.VEGA_SENDS_PER_HOUR;
});

describe("flujo de confirmación", () => {
  it("un correo queda pendiente aunque la autonomía lo permita, y se envía al confirmar", async () => {
    const proposed = await propose("send_email", email);
    expect(proposed.blocked).toBe(false);
    if (proposed.blocked) return;
    expect(proposed.executed).toBe(false);
    expect(proposed.action).toMatchObject({ status: "pending", risk: "send" });
    expect(proposed.response.estado).toBe("pendiente_de_confirmacion");
    expect(execute).not.toHaveBeenCalled();
    expect(actions.rows[0].expiresAt).toEqual(new Date(now.getTime() + 24 * HOUR));

    const decided = await decideAction("u1", proposed.action.id, true, now);
    expect(decided.ok).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(actions.rows[0]).toMatchObject({ status: "done", executedBy: "user", riskClass: "send" });
    expect(messages.rows).toHaveLength(1);

    const again = await decideAction("u1", proposed.action.id, true, now);
    expect(again.message).toMatch(/ya se había decidido/);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("una escritura reversible se ejecuta sola con autonomía y queda en la bitácora", async () => {
    const proposed = await propose("app_action", sheet);
    expect(!proposed.blocked && proposed.executed).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(actions.rows[0]).toMatchObject({ status: "done", executedBy: "autonomy", riskClass: "write" });
    const log = await actionLog("u1");
    expect(log[0]).toMatchObject({ status: "done", executedBy: "autonomy", description: "Fila nueva en Prospectos" });
  });

  it("sin autonomía la escritura espera la tarjeta", async () => {
    const proposed = await proposeAction(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { userId: "u1", chatId: "c1", kind: "app_action", payload: sheet as any, tainted: false, userMessage: "", now },
      { autonomy: async () => ({ ok: false, reason: "no permitido" }), execute },
    );
    expect(!proposed.blocked && proposed.executed).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("no deja decidir acciones de otro socio", async () => {
    const proposed = await propose("send_email", email);
    if (proposed.blocked) throw new Error("bloqueada");
    const other = await decideAction("u2", proposed.action.id, true, now);
    expect(other.ok).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("vencimiento", () => {
  it("una acción vencida no se puede confirmar", async () => {
    const proposed = await propose("send_email", email);
    if (proposed.blocked) throw new Error("bloqueada");
    const later = new Date(now.getTime() + 25 * HOUR);
    const decided = await decideAction("u1", proposed.action.id, true, later);
    expect(decided.ok).toBe(false);
    expect(decided.message).toMatch(/venció/);
    expect(decided.action?.status).toBe("expired");
    expect(actions.rows[0]).toMatchObject({ status: "expired", executedBy: "system" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("barre las pendientes viejas, incluidas las de antes de esta fase", async () => {
    await actions.create({ data: { userId: "u1", conversationId: "c1", kind: "send_email", payload: email, createdAt: new Date(now.getTime() - 30 * HOUR) } });
    await actions.create({ data: { userId: "u1", conversationId: "c1", kind: "send_email", payload: email, createdAt: now, expiresAt: new Date(now.getTime() + HOUR) } });
    expect(await expireStaleActions("u1", now)).toBe(1);
    expect(actions.rows.map((row) => row.status)).toEqual(["expired", "pending"]);
  });

  it("la vista marca como vencida una pendiente fuera de tiempo", () => {
    const view = actionView({ id: "a", kind: "send_email", payload: email, status: "pending", result: null, createdAt: new Date(now.getTime() - 25 * HOUR) }, now);
    expect(view.status).toBe("expired");
  });
});

describe("cancelar no se reintenta", () => {
  it("una acción cancelada no se vuelve a proponer por iniciativa de Vega", async () => {
    const first = await propose("send_email", email);
    if (first.blocked) throw new Error("bloqueada");
    const cancelled = await decideAction("u1", first.action.id, false, now);
    expect(cancelled.message).toMatch(/No se envió nada/);
    expect(actions.rows[0]).toMatchObject({ status: "cancelled", executedBy: "user" });

    const retry = await propose("send_email", { ...email, subject: "propuesta " }, { userMessage: "¿y qué más tengo hoy?" });
    expect(retry.blocked).toBe(true);
    expect(actions.rows).toHaveLength(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it("si el socio lo pide de nuevo, vuelve a ser una tarjeta (nunca automática)", async () => {
    const first = await propose("app_action", sheet, { tainted: true });
    if (first.blocked) throw new Error("bloqueada");
    await decideAction("u1", first.action.id, false, now);
    const again = await propose("app_action", sheet, { userMessage: "sí, agrégala de nuevo" });
    expect(again.blocked).toBe(false);
    expect(!again.blocked && again.executed).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("contenido externo", () => {
  it("después de leer contenido externo ni las escrituras con autonomía corren solas", async () => {
    const proposed = await propose("app_action", sheet, { tainted: true });
    expect(!proposed.blocked && proposed.executed).toBe(false);
    expect(!proposed.blocked && proposed.action.tainted).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("límite de envíos por hora", () => {
  it("frena el envío 21 de la hora y deja la tarjeta pendiente", async () => {
    for (let i = 0; i < 20; i += 1) {
      await actions.create({
        data: { userId: "u1", conversationId: "c1", kind: "send_email", payload: email, status: "done", riskClass: "send", decidedAt: new Date(now.getTime() - 10 * 60_000) },
      });
    }
    await actions.create({
      data: { userId: "u1", conversationId: "c1", kind: "send_email", payload: email, status: "done", riskClass: "send", decidedAt: new Date(now.getTime() - 2 * HOUR) },
    });
    const proposed = await propose("send_email", { ...email, to: "beto@cliente.mx" });
    if (proposed.blocked) throw new Error("bloqueada");
    const decided = await decideAction("u1", proposed.action.id, true, now);
    expect(decided.ok).toBe(false);
    expect(decided.stillPending).toBe(true);
    expect(decided.message).toMatch(/20 envíos por hora/);
    expect(execute).not.toHaveBeenCalled();
    expect(actions.rows.at(-1)?.status).toBe("pending");

    const nextHour = new Date(now.getTime() + HOUR);
    const later = await decideAction("u1", proposed.action.id, true, nextHour);
    expect(later.ok).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("respeta VEGA_SENDS_PER_HOUR y no cuenta otros socios", async () => {
    process.env.VEGA_SENDS_PER_HOUR = "1";
    await actions.create({ data: { userId: "u2", conversationId: "c2", kind: "send_email", payload: email, status: "done", riskClass: "send", decidedAt: now } });
    const one = await propose("send_email", email);
    if (one.blocked) throw new Error("bloqueada");
    expect((await decideAction("u1", one.action.id, true, now)).ok).toBe(true);
    const two = await propose("send_email", { ...email, to: "otro@x.mx" });
    if (two.blocked) throw new Error("bloqueada");
    expect((await decideAction("u1", two.action.id, true, now)).stillPending).toBe(true);
  });
});
