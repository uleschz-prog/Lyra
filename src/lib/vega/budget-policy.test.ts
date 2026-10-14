import assert from "node:assert/strict";
import test from "node:test";

import { monthlyLlmBudgetUsd, monthlyReferenceUsd, readBudgetRatio } from "./budget-policy";

test("el precio de referencia mensual separa Founder de Corporate", () => {
  assert.equal(monthlyReferenceUsd("FOUNDER"), 29);
  assert.equal(monthlyReferenceUsd("CORPORATE"), 5000);
  assert.equal(monthlyReferenceUsd("PRO"), 0);
  assert.equal(monthlyReferenceUsd("VEGA"), 0);
});

test("el tope de LLM es la proporción del precio mensual y acepta override", () => {
  assert.ok(Math.abs(monthlyLlmBudgetUsd("FOUNDER", 0.05, null) - 1.45) < 1e-9);
  assert.equal(monthlyLlmBudgetUsd("CORPORATE", 0.05, null), 250);
  assert.ok(Math.abs(monthlyLlmBudgetUsd("FOUNDER", 0.05, 0.1) - 2.9) < 1e-9);
  assert.equal(monthlyLlmBudgetUsd("FOUNDER", 0.05, 0), 0);
  assert.equal(monthlyLlmBudgetUsd("FOUNDER", 0.05, 4), 29);
});

test("LLM_BUDGET_RATIO vacío vale 5% y un valor fuera de rango se rechaza", () => {
  assert.equal(readBudgetRatio(undefined), 0.05);
  assert.equal(readBudgetRatio("  "), 0.05);
  assert.equal(readBudgetRatio("0.1"), 0.1);
  assert.throws(() => readBudgetRatio("2"), /LLM_BUDGET_RATIO/);
  assert.throws(() => readBudgetRatio("no"), /LLM_BUDGET_RATIO/);
});
