import { beforeEach, describe, expect, it, vi } from "vitest";

import { table } from "../vega/fake-prisma";

const state = vi.hoisted(() => ({ db: null as unknown, user: null as unknown }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => state.db }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentUser: async () => state.user }));

import { GET as listGet, POST as listPost } from "@/app/api/admin/ingresos/route";
import { GET as historyGet, PATCH as editPatch } from "@/app/api/admin/ingresos/[key]/route";
import { GET as exportGet } from "@/app/api/admin/ingresos/export/route";
import {
  classifyTransaction,
  filterIncome,
  incomeCsv,
  type IncomeReport,
  parseAmount,
  parseIncomeFilters,
  sumIncome,
} from "@/lib/admin/income";

const admin = { id: "admin-1", name: "Ule Admin", email: "admin@lyra.mx", role: "ADMIN" };
const member = { id: "user-1", name: "Socia Uno", email: "uno@lyra.mx", role: "MEMBER" };

function setup() {
  const user = table();
  const wallet = table();
  const transaction = table(() => ({ reason: null, externalRef: null, creditDelta: 0, metadata: null }));
  const adminIncomeEntry = table(() => ({ reference: null, note: null, currency: "USD" }));
  const adminIncomeEdit = table();
  const commission = table();
  user.rows.push(
    { id: "user-1", name: "Socia Uno", email: "uno@lyra.mx", username: "socia1", credits: 500, walletBalance: 12.5 },
    { id: "user-2", name: "José Núñez", email: "jose@lyra.mx", username: "jose", credits: 50, walletBalance: 0 },
  );
  const at = (iso: string) => new Date(iso);
  transaction.rows.push(
    // Inscripción por Mercado Pago (hoy, CDMX).
    { id: "tx-signup-mp", userId: "user-1", kind: "CREDIT_PURCHASE", amount: 197, reason: "membership.activate", description: "Inscripción Negocio · Mercado Pago", externalRef: "mp:111", createdAt: at("2026-11-25T16:00:00Z") },
    // Recarga por USDT (este mes).
    { id: "tx-credits-usdt", userId: "user-2", kind: "REBUY", amount: 50, reason: "admin.usdt.credits", description: "Recarga de 50 créditos · USDT TRC20 · abc", externalRef: "usdt:ord1", createdAt: at("2026-11-10T18:00:00Z") },
    // Inscripción USDT antigua (TXID solo en la descripción; mes pasado).
    { id: "tx-signup-usdt", userId: "user-2", kind: "CREDIT_PURCHASE", amount: 97, reason: "membership.activate", description: "Inscripción Inicio · USDT TRC20 · 9f8e7d6c5b4a39281706", externalRef: null, createdAt: at("2026-10-28T18:00:00Z") },
    // Inscripción con código promocional: no entró dinero.
    { id: "tx-promo", userId: "user-1", kind: "CREDIT_PURCHASE", amount: 497, reason: "membership.activate", description: "Membresía Pro con código promocional", externalRef: "promo:ABC:user-1", createdAt: at("2026-11-20T18:00:00Z") },
    // Validada por admin.
    { id: "tx-admin", userId: "user-1", kind: "CREDIT_PURCHASE", amount: 97, reason: "membership.activate", description: "Inscripción Inicio · validada por administración", externalRef: null, createdAt: at("2026-11-21T18:00:00Z") },
    // No son ingresos: gasto de créditos y comisión.
    { id: "tx-spend", userId: "user-1", kind: "CREDIT_SPEND", amount: 0, description: "Vega", createdAt: at("2026-11-25T15:00:00Z") },
    { id: "tx-comm", userId: "user-1", kind: "COMMISSION", amount: 20, description: "Comisión", createdAt: at("2026-11-25T15:00:00Z") },
  );
  state.db = { user, transaction, adminIncomeEntry, adminIncomeEdit, creditWallet: wallet, commission };
  return { user, transaction, adminIncomeEntry, adminIncomeEdit, wallet };
}

const url = (path: string) => `https://lyyra.vercel.app${path}`;
const json = (body: unknown, method = "POST", headers: Record<string, string> = {}) =>
  ({ method, headers: { "content-type": "application/json", origin: "https://lyyra.vercel.app", ...headers }, body: JSON.stringify(body) }) as RequestInit;
const ctx = (key: string) => ({ params: Promise.resolve({ key }) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-25T18:00:00Z")); // 12:00 CDMX
  state.user = admin;
});

describe("clasificación de pagos", () => {
  it("tipo, método, estado y referencia", () => {
    expect(classifyTransaction({ kind: "CREDIT_PURCHASE", amount: 1, reason: "membership.activate", description: "Inscripción X · Mercado Pago", externalRef: "mp:1" })).toEqual({ type: "inscripcion", method: "mercadopago", status: "pagado", reference: "mp:1" });
    expect(classifyTransaction({ kind: "CREDIT_PURCHASE", amount: 1, reason: null, description: "Upgrade a Pro · Mercado Pago", externalRef: "mp:2" }).type).toBe("upgrade");
    expect(classifyTransaction({ kind: "REBUY", amount: 1, reason: "payments.rebuy", description: "Mensualidad Pro", externalRef: "mp:3" }).type).toBe("recompra");
    expect(classifyTransaction({ kind: "REBUY", amount: 1, reason: "payments.credits", description: "Recarga", externalRef: "mp:4" }).type).toBe("recarga");
    expect(classifyTransaction({ kind: "CREDIT_PURCHASE", amount: 1, reason: null, description: "Inscripción · USDT TRC20 · 9f8e7d6c5b4a39281706", externalRef: null })).toMatchObject({ method: "usdt", reference: "9f8e7d6c5b4a39281706" });
    expect(classifyTransaction({ kind: "CREDIT_PURCHASE", amount: 1, reason: null, description: "Membresía", externalRef: "code:X:u" })).toMatchObject({ method: "codigo", status: "sin_cobro" });
    expect(classifyTransaction({ kind: "CREDIT_PURCHASE", amount: 1, reason: null, description: "Inscripción · validada por administración", externalRef: null }).method).toBe("admin");
  });

  it("montos válidos", () => {
    expect(parseAmount("1,250.50")).toBe(1250.5);
    expect(parseAmount(0)).toBe(0);
    expect(parseAmount("-1")).toBeNull();
    expect(parseAmount("1.234")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("API de ingresos: acceso", () => {
  it("sin sesión 401, socio 403, admin 200 (lista, historial, CSV, escrituras)", async () => {
    setup();
    state.user = null;
    expect((await listGet(new Request(url("/api/admin/ingresos")))).status).toBe(401);
    state.user = member;
    expect((await listGet(new Request(url("/api/admin/ingresos")))).status).toBe(403);
    expect((await exportGet(new Request(url("/api/admin/ingresos/export")))).status).toBe(403);
    expect((await historyGet(new Request(url("/api/admin/ingresos/pago:tx-signup-mp")), ctx("pago:tx-signup-mp"))).status).toBe(403);
    expect((await editPatch(new Request(url("/api/admin/ingresos/pago:tx-signup-mp"), json({ amount: 1, reason: "hackeo" }, "PATCH")), ctx("pago:tx-signup-mp"))).status).toBe(403);
    expect((await listPost(new Request(url("/api/admin/ingresos"), json({ user: "uno@lyra.mx", type: "otro", method: "efectivo", currency: "USD", amount: 5 })))).status).toBe(403);
    state.user = admin;
    expect((await listGet(new Request(url("/api/admin/ingresos")))).status).toBe(200);
  });

  it("escrituras exigen JSON del mismo origen", async () => {
    setup();
    const form = { method: "PATCH", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "amount=1&reason=xx" };
    expect((await editPatch(new Request(url("/api/admin/ingresos/pago:tx-signup-mp"), form), ctx("pago:tx-signup-mp"))).status).toBe(415);
    const foreign = json({ amount: 1, reason: "motivo" }, "PATCH", { origin: "https://evil.example" });
    expect((await editPatch(new Request(url("/api/admin/ingresos/pago:tx-signup-mp"), foreign), ctx("pago:tx-signup-mp"))).status).toBe(403);
  });
});

describe("API de ingresos: lista y totales", () => {
  it("por defecto el mes en curso; códigos sin cobro fuera de totales; no lista gastos ni comisiones", async () => {
    setup();
    const report = (await (await listGet(new Request(url("/api/admin/ingresos")))).json()) as IncomeReport;
    expect(report.filters.from).toBe("2026-11-01");
    expect(report.rows.map((row) => row.id)).toEqual(["tx-signup-mp", "tx-admin", "tx-credits-usdt"]);
    expect(report.totals.today.USD).toMatchObject({ total: 197, count: 1 });
    expect(report.totals.month.USD).toMatchObject({ total: 344, count: 3 });
    expect(report.totals.month.USD.byType).toEqual({ inscripcion: { total: 294, count: 2 }, recarga: { total: 50, count: 1 } });
    expect(report.totals.month.USD.byMethod).toMatchObject({ mercadopago: { total: 197 }, usdt: { total: 50 }, admin: { total: 97 } });
    expect(report.rows[0]).toMatchObject({ userName: "Socia Uno", userEmail: "uno@lyra.mx", username: "socia1", type: "inscripcion", method: "mercadopago", currency: "USD", status: "pagado", reference: "mp:111" });
  });

  it("filtros: rango, tipo, método, búsqueda sin acentos y todo el historial", async () => {
    setup();
    const get = async (query: string) => (await (await listGet(new Request(url(`/api/admin/ingresos?${query}`)))).json()) as IncomeReport;
    expect((await get("todo=1")).rows.map((r) => r.id)).toEqual(["tx-signup-mp", "tx-admin", "tx-credits-usdt", "tx-signup-usdt"]);
    expect((await get("todo=1&sinCobro=1")).rows).toHaveLength(5);
    const october = await get("desde=2026-10-01&hasta=2026-10-31");
    expect(october.rows.map((r) => r.id)).toEqual(["tx-signup-usdt"]);
    expect(october.totals.range.USD.total).toBe(97);
    // Hoy y este mes no dependen del rango elegido.
    expect(october.totals.month.USD.total).toBe(344);
    expect((await get("todo=1&tipo=recarga")).rows.map((r) => r.id)).toEqual(["tx-credits-usdt"]);
    expect((await get("todo=1&metodo=usdt")).totals.range.USD.total).toBe(147);
    expect((await get("todo=1&q=jose%20nunez")).rows.map((r) => r.id)).toEqual(["tx-credits-usdt", "tx-signup-usdt"]);
    expect((await get("todo=1&usuario=user-1")).rows.map((r) => r.id)).toEqual(["tx-signup-mp", "tx-admin"]);
    // El día se corta en hora CDMX: 25-nov 00:30 CDMX = 06:30 UTC.
    expect(parseIncomeFilters(new URLSearchParams("desde=2026-02-30"), new Date()).from).toBe("2026-11-01");
  });
});

describe("API de ingresos: editar con bitácora", () => {
  it("guarda original, anterior, nuevo, motivo, quién y cuándo; los totales usan el monto vigente; no toca nada más", async () => {
    const { transaction, user, adminIncomeEdit } = setup();
    const before = JSON.stringify({ tx: transaction.rows, users: user.rows });

    const first = await editPatch(new Request(url("/api/admin/ingresos/pago:tx-signup-mp"), json({ amount: "180.50", reason: "Mercado Pago descontó su comisión" }, "PATCH")), ctx("pago:tx-signup-mp"));
    expect(first.status).toBe(200);
    const second = await editPatch(new Request(url("/api/admin/ingresos/pago:tx-signup-mp"), json({ amount: 185, reason: "Corrección tras conciliar" }, "PATCH")), ctx("pago:tx-signup-mp"));
    expect(second.status).toBe(200);

    expect(adminIncomeEdit.rows).toHaveLength(2);
    expect(adminIncomeEdit.rows[0]).toMatchObject({ source: "pago", transactionId: "tx-signup-mp", entryId: null, originalAmount: 197, previousAmount: 197, newAmount: 180.5, reason: "Mercado Pago descontó su comisión", editedById: "admin-1", editedByName: "Ule Admin", editedByEmail: "admin@lyra.mx" });
    expect(adminIncomeEdit.rows[1]).toMatchObject({ originalAmount: 197, previousAmount: 180.5, newAmount: 185 });
    expect(adminIncomeEdit.rows[1].createdAt).toBeInstanceOf(Date);
    // El pago original, los créditos y la wallet no cambian.
    expect(JSON.stringify({ tx: transaction.rows, users: user.rows })).toBe(before);

    const report = (await (await listGet(new Request(url("/api/admin/ingresos")))).json()) as IncomeReport;
    const row = report.rows.find((item) => item.id === "tx-signup-mp")!;
    expect(row).toMatchObject({ amount: 185, originalAmount: 197, edited: true, editCount: 2, lastEdit: { reason: "Corrección tras conciliar", editedByName: "Ule Admin" } });
    expect(report.totals.today.USD.total).toBe(185);
    expect(report.totals.month.USD.total).toBe(332);

    const history = (await (await historyGet(new Request(url("/api/admin/ingresos/pago:tx-signup-mp")), ctx("pago:tx-signup-mp"))).json()) as { edits: { newAmount: number }[] };
    expect(history.edits.map((edit) => edit.newAmount)).toEqual([185, 180.5]);
  });

  it("rechaza datos inválidos, la misma cantidad, ingresos que no existen y asientos que no son ingresos", async () => {
    setup();
    const patch = async (key: string, body: unknown) => editPatch(new Request(url(`/api/admin/ingresos/${key}`), json(body, "PATCH")), ctx(key));
    expect((await patch("pago:tx-signup-mp", { amount: -5, reason: "motivo" })).status).toBe(400);
    expect((await patch("pago:tx-signup-mp", { amount: 10, reason: "" })).status).toBe(400);
    expect((await patch("pago:tx-signup-mp", { amount: 197, reason: "igual" })).status).toBe(400);
    expect((await patch("pago:no-existe-123", { amount: 10, reason: "motivo" })).status).toBe(404);
    expect((await patch("pago:tx-comm", { amount: 10, reason: "motivo" })).status).toBe(404);
    expect((await patch("otro:tx-signup-mp", { amount: 10, reason: "motivo" })).status).toBe(400);
  });
});

describe("API de ingresos: captura manual", () => {
  it("registra el ingreso ligado al socio, suma en totales y no acredita créditos", async () => {
    const { adminIncomeEntry, user, transaction } = setup();
    const response = await listPost(
      new Request(url("/api/admin/ingresos"), json({ user: "@jose", type: "inscripcion", method: "efectivo", currency: "MXN", amount: "3500", date: "2026-11-24", reference: "Recibo 12", note: "Pagó en oficina" })),
    );
    expect(response.status).toBe(201);
    expect(adminIncomeEntry.rows[0]).toMatchObject({ userId: "user-2", userName: "José Núñez", userEmail: "jose@lyra.mx", type: "inscripcion", method: "efectivo", currency: "MXN", amount: 3500, reference: "Recibo 12", createdById: "admin-1", createdByName: "Ule Admin" });
    expect((adminIncomeEntry.rows[0].receivedAt as Date).toISOString()).toBe("2026-11-24T18:00:00.000Z");
    expect(user.rows.find((u) => u.id === "user-2")).toMatchObject({ credits: 50, walletBalance: 0 });
    expect(transaction.rows).toHaveLength(7);

    const report = (await (await listGet(new Request(url("/api/admin/ingresos")))).json()) as IncomeReport;
    expect(report.totals.month.MXN).toMatchObject({ total: 3500, count: 1 });
    expect(report.totals.month.USD.total).toBe(344);
    const manual = report.rows.find((row) => row.source === "manual")!;
    expect(manual).toMatchObject({ userName: "José Núñez", status: "pagado", note: "Pagó en oficina" });

    // También se puede editar, con bitácora.
    const edited = await editPatch(new Request(url(`/api/admin/ingresos/${manual.key}`), json({ amount: 3400, reason: "Faltaron 100" }, "PATCH")), ctx(manual.key));
    expect(edited.status).toBe(200);
    expect(adminIncomeEntry.rows[0].amount).toBe(3500);
  });

  it("valida socio, tipo, método, moneda, monto y fecha", async () => {
    setup();
    const post = async (body: Record<string, unknown>) => (await listPost(new Request(url("/api/admin/ingresos"), json({ user: "uno@lyra.mx", type: "recarga", method: "transferencia", currency: "USD", amount: 10, ...body })))).status;
    expect(await post({})).toBe(201);
    expect(await post({ user: "nadie@lyra.mx" })).toBe(404);
    expect(await post({ type: "regalo" })).toBe(400);
    expect(await post({ method: "codigo" })).toBe(400);
    expect(await post({ currency: "EUR" })).toBe(400);
    expect(await post({ amount: 0 })).toBe(400);
    expect(await post({ date: "2026-11-26" })).toBe(400);
  });
});

describe("CSV", () => {
  it("descarga con los filtros y sin fórmulas", async () => {
    setup();
    const response = await exportGet(new Request(url("/api/admin/ingresos/export?todo=1")));
    expect(response.headers.get("content-type")).toContain("text/csv");
    const text = await response.text();
    expect(text.split("\r\n")[0]).toContain("Fecha (CDMX)");
    expect(text).toContain("Socia Uno");
    expect(text).toContain("tx-signup-usdt");
    const rows = filterIncome([], {});
    expect(incomeCsv(rows)).toContain("Monto vigente");
    const injected = incomeCsv([{ ...(JSON.parse(JSON.stringify({ key: "manual:x", source: "manual", id: "x", at: "2026-11-25T18:00:00Z", userId: null, userName: "=HYPERLINK(1)", userEmail: "", username: null, type: "otro", method: "otro", currency: "USD", originalAmount: 1, amount: 1, edited: false, lastEdit: null, editCount: 0, status: "pagado", reference: null, description: "", note: null }))) }]);
    expect(injected).toContain("'=HYPERLINK(1)");
    expect(sumIncome([])).toEqual({});
  });
});
