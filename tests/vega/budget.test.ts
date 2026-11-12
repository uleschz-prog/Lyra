import { describe, expect, it } from "vitest";

import { continueNote, createTurnBudget, defaultVegaLimits, vegaLimits } from "@/lib/vega/budget";
import { estimateCostUsd, summarizeUsage } from "@/lib/vega/usage";

describe("límites del turno de Vega", () => {
  it("usa 12 pasos y 45 s por defecto", () => {
    expect(vegaLimits({})).toEqual(defaultVegaLimits);
    expect(defaultVegaLimits.maxSteps).toBe(12);
  });

  it("lee VEGA_MAX_STEPS y VEGA_TIME_BUDGET_MS dentro de rangos seguros", () => {
    expect(vegaLimits({ VEGA_MAX_STEPS: "6", VEGA_TIME_BUDGET_MS: "30000" })).toMatchObject({ maxSteps: 6, timeBudgetMs: 30_000 });
    expect(vegaLimits({ VEGA_MAX_STEPS: "500", VEGA_TIME_BUDGET_MS: "999999" })).toMatchObject({ maxSteps: 30, timeBudgetMs: 55_000 });
    expect(vegaLimits({ VEGA_MAX_STEPS: "0", VEGA_TIME_BUDGET_MS: "10" })).toMatchObject({ maxSteps: 1, timeBudgetMs: 10_000 });
    expect(vegaLimits({ VEGA_MAX_STEPS: "abc" }).maxSteps).toBe(12);
  });

  it("corta por pasos al llegar al máximo", () => {
    const now = 0;
    const budget = createTurnBudget({ maxSteps: 3, timeBudgetMs: 45_000, minStepMs: 8_000 }, 0, () => now);
    expect(budget.canCallModel(0)).toEqual({ ok: true });
    expect(budget.canCallModel(2)).toEqual({ ok: true });
    expect(budget.canCallModel(3)).toEqual({ ok: false, reason: "steps" });
  });

  it("corta por tiempo cuando queda menos del mínimo para otra llamada", () => {
    let now = 1_000;
    const budget = createTurnBudget({ maxSteps: 12, timeBudgetMs: 45_000, minStepMs: 8_000 }, 1_000, () => now);
    now = 30_000;
    expect(budget.canCallModel(1)).toEqual({ ok: true });
    expect(budget.modelTimeoutMs()).toBe(16_000);
    now = 39_000;
    expect(budget.canCallModel(1)).toEqual({ ok: false, reason: "time" });
    now = 100_000;
    expect(budget.remainingMs()).toBe(0);
    expect(budget.modelTimeoutMs()).toBe(1_000);
  });

  it("explica al socio cómo continuar", () => {
    expect(continueNote("time")).toContain("continúa");
    expect(continueNote("steps")).toContain("límite de pasos");
  });
});

describe("costo estimado", () => {
  it("estima Gemini 2.5 Flash con la tabla de precios", () => {
    expect(estimateCostUsd({ model: "gemini-2.5-flash", inputTokens: 1_000_000, outputTokens: 0, reportedCostUsd: null })).toBeCloseTo(0.3);
    expect(estimateCostUsd({ model: "google/gemini-2.5-flash", inputTokens: 0, outputTokens: 1_000_000, reportedCostUsd: null })).toBeCloseTo(2.5);
  });

  it("prefiere el costo que informa el proveedor y suma el turno", () => {
    const total = summarizeUsage([
      { provider: "gemini", model: "gemini-2.5-flash", inputTokens: 1000, outputTokens: 100, reportedCostUsd: null },
      { provider: "openrouter", model: "x/otro", inputTokens: 500, outputTokens: 50, reportedCostUsd: 0.001 },
    ]);
    expect(total.calls).toBe(2);
    expect(total.inputTokens).toBe(1500);
    expect(total.costUsd).toBeCloseTo(0.0003 + 0.00025 + 0.001);
  });

  it("deja el costo en null si un modelo no tiene precio", () => {
    expect(summarizeUsage([{ provider: "openrouter", model: "x/otro", inputTokens: 1, outputTokens: 1, reportedCostUsd: null }]).costUsd).toBeNull();
  });
});
