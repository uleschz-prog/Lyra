import { beforeEach, describe, expect, it, vi } from "vitest";

import { table } from "./fake-prisma";

const db = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => db.current }));

const { callCostUsd, isCheaper, priceFor, turnCostUsd } = await import("@/lib/vega/cost");
const {
  capReachedMessage,
  costCapUsd,
  costMonth,
  costResetsAt,
  costStatus,
  costTierFor,
  degradedModels,
  meterView,
  recordUsage,
} = await import("@/lib/vega/cost-cap");

const env = (extra: Record<string, string> = {}) => ({ ...extra });
const now = new Date("2026-11-20T18:00:00Z");
let logs: ReturnType<typeof table>;

beforeEach(() => {
  logs = table();
  db.current = { vegaUsageLog: logs };
});

describe("precios por modelo", () => {
  it("calcula Gemini directo y OpenRouter con la tabla", () => {
    expect(callCostUsd({ model: "gemini-2.5-flash", inputTokens: 1_000_000, outputTokens: 1_000_000, reportedCostUsd: null }, env())).toEqual({
      costUsd: 2.8,
      source: "table",
    });
    expect(priceFor("google/gemini-2.5-flash-lite", env()).price).toEqual({ input: 0.1, output: 0.4 });
    expect(priceFor("models/gemini-2.5-flash-001", env())).toMatchObject({ source: "table", price: { input: 0.3, output: 2.5 } });
  });

  it("prefiere el costo que reporta OpenRouter", () => {
    expect(callCostUsd({ model: "google/gemini-2.5-flash", inputTokens: 9e9, outputTokens: 9e9, reportedCostUsd: 0.0042 }, env())).toEqual({
      costUsd: 0.0042,
      source: "reported",
    });
  });

  it("usa un precio por defecto alto para modelos desconocidos y acepta overrides por env", () => {
    expect(priceFor("acme/raro", env())).toEqual({ source: "default", price: { input: 1.5, output: 7.5 } });
    expect(priceFor("acme/raro", env({ VEGA_COST_DEFAULT_PRICE: "2,8" })).price).toEqual({ input: 2, output: 8 });
    const custom = env({ VEGA_MODEL_PRICES: JSON.stringify({ "acme/raro": { input: 0.05, output: 0.1 }, "gemini-2.5-flash": { input: 1, output: 1 } }) });
    expect(priceFor("acme/raro", custom)).toEqual({ source: "table", price: { input: 0.05, output: 0.1 } });
    expect(priceFor("gemini-2.5-flash", custom).price).toEqual({ input: 1, output: 1 });
    expect(priceFor("gemini-2.5-flash", env({ VEGA_MODEL_PRICES: "{no json" })).price).toEqual({ input: 0.3, output: 2.5 });
  });

  it("suma el turno e informa la fuente menos confiable", () => {
    const total = turnCostUsd(
      [
        { model: "gemini-2.5-flash", inputTokens: 1000, outputTokens: 100, reportedCostUsd: null },
        { model: "acme/raro", inputTokens: 1000, outputTokens: 0, reportedCostUsd: null },
      ],
      env(),
    );
    expect(total.costUsd).toBeCloseTo(0.0003 + 0.00025 + 0.0015, 9);
    expect(total.source).toBe("default");
  });

  it("compara modelos para degradar", () => {
    expect(isCheaper("gemini-2.5-flash-lite", "gemini-2.5-flash", env())).toBe(true);
    expect(isCheaper("gemini-2.5-flash-lite", "gemini-2.5-flash-lite", env())).toBe(false);
    expect(degradedModels("gemini-2.5-flash", env())).toEqual({ gemini: "gemini-2.5-flash-lite", openrouter: "google/gemini-2.5-flash-lite" });
    expect(degradedModels("gemini-2.5-flash-lite", env())).toBeNull();
  });
});

describe("tope por plan", () => {
  it("es el 5 % de la recarga mínima de cada plan, incluidos los planes anteriores", () => {
    const cap = (pkg: string, role = "USER") => costCapUsd({ package: pkg, role }, env());
    expect(cap("STARTED")).toBe(0.95);
    expect(cap("PRO")).toBe(2.45);
    expect(cap("FOUNDER")).toBe(4.95);
    expect([cap("FREE"), cap("VEGA"), cap("VEGA_PARTNER")]).toEqual([0.95, 0.95, 0.95]);
    expect(cap("POLARIS")).toBe(2.45);
    expect([cap("LYRA_MASTER"), cap("CORPORATE")]).toEqual([4.95, 4.95]);
    expect(cap("NONE")).toBeNull();
    expect(cap("FOUNDER", "ADMIN")).toBeNull();
    expect(costTierFor("POLARIS")).toBe("negocio");
  });

  it("acepta porcentaje, montos por plan y apagado por env", () => {
    expect(costCapUsd({ package: "STARTED" }, env({ VEGA_COST_CAP_PCT: "10" }))).toBe(1.9);
    expect(costCapUsd({ package: "PRO" }, env({ VEGA_COST_CAP_NEGOCIO_USD: "3.5" }))).toBe(3.5);
    expect(costCapUsd({ package: "FOUNDER" }, env({ VEGA_COST_CAP: "off" }))).toBeNull();
  });

  it("usa el mes calendario de Ciudad de México", () => {
    // 1-dic 05:00 UTC = 30-nov 23:00 en CDMX.
    expect(costMonth(new Date("2026-12-01T05:00:00Z"))).toBe("2026-11");
    expect(costMonth(new Date("2026-12-01T06:00:00Z"))).toBe("2026-12");
    expect(costResetsAt(now).toISOString()).toBe("2026-12-01T06:00:00.000Z");
    expect(costResetsAt(new Date("2026-12-15T12:00:00Z")).toISOString()).toBe("2027-01-01T06:00:00.000Z");
  });
});

describe("estado del tope", () => {
  const user = { id: "u1", package: "STARTED", role: "USER" };
  const spend = async (costUsd: number, at = now) =>
    recordUsage({
      userId: "u1",
      conversationId: "c1",
      source: "chat",
      usage: { calls: 1, providers: ["gemini:gemini-2.5-flash"], inputTokens: 1, outputTokens: 1, costUsd, costSource: "table" },
      now: at,
    });

  it("suma solo el mes actual y marca aviso, degradación y bloqueo", async () => {
    await spend(5, new Date("2026-10-15T18:00:00Z")); // otro mes: no cuenta
    expect((await costStatus(user, now, env())).level).toBe("ok");

    await spend(0.5);
    let status = await costStatus(user, now, env());
    expect(status).toMatchObject({ level: "ok", pct: 52.6, degrade: false, tier: "inicio" });
    expect(status.remainingUsd).toBeCloseTo(0.45);

    await spend(0.3);
    status = await costStatus(user, now, env());
    expect(status).toMatchObject({ level: "warn", degrade: true });
    expect((await costStatus(user, now, env({ VEGA_COST_DEGRADE: "off" }))).degrade).toBe(false);

    await spend(0.2);
    status = await costStatus(user, now, env());
    expect(status).toMatchObject({ level: "capped", degrade: false, remainingUsd: 0 });
    expect(capReachedMessage(status)).toMatch(/Negocio o el Pro/);
    expect(capReachedMessage(status)).toMatch(/1 de diciembre/);
    expect(meterView(status)).toEqual({ level: "capped", pct: 100, resetsAt: "2026-12-01T06:00:00.000Z", degraded: false, tier: "inicio" });
  });

  it("sin tope no consulta la base", async () => {
    db.current = {};
    expect((await costStatus({ id: "u1", package: "FOUNDER", role: "ADMIN" }, now, env())).level).toBe("unlimited");
  });

  it("no registra turnos sin llamadas y nunca rompe si falla la base", async () => {
    expect(
      await recordUsage({ userId: "u1", conversationId: null, source: "chat", usage: { calls: 0, providers: [], inputTokens: 0, outputTokens: 0, costUsd: 0, costSource: "table" } }),
    ).toBeNull();
    db.current = {};
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await spend(0.1)).toBeNull();
  });
});
