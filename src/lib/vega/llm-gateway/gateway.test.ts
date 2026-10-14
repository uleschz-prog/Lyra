import assert from "node:assert/strict";
import test from "node:test";

import { MemoryBudget } from "./budget-ledger.test-support";
import { BudgetExceededError, LlmAuthError, LlmUnavailableError } from "./errors";
import { backoffMs, classifyAttempt } from "./fallback";
import { LlmGateway } from "./gateway";
import { estimateTokens } from "./tokens";
import { downgradePath, monthKey, readChains, readRetries, type LlmChains, type ModelPrice, type TransportResult } from "./types";

function chains(): LlmChains {
  return {
    cheap: ["cheap-model"],
    balanced: ["balanced-model"],
    premium: ["premium-model"],
  };
}

function prices(): Map<string, ModelPrice> {
  return new Map([
    ["cheap-model", { promptPerToken: 0.001, completionPerToken: 0.001 }],
    ["balanced-model", { promptPerToken: 0.01, completionPerToken: 0.01 }],
    ["premium-model", { promptPerToken: 0.05, completionPerToken: 0.05 }],
  ]);
}

function ok(text: string, cost?: number): TransportResult {
  return {
    status: 200,
    body: {
      choices: [{ message: { content: text } }],
      usage: cost == null ? { prompt_tokens: 10, completion_tokens: 4 } : { cost, prompt_tokens: 10, completion_tokens: 4 },
    },
  };
}

function gateway(options: {
  script: TransportResult[];
  budgetUsd?: number;
  retries?: number;
  chain?: LlmChains;
  priceMap?: Map<string, ModelPrice>;
  budget?: MemoryBudget;
}) {
  const budget = options.budget ?? new MemoryBudget();
  const calls: string[] = [];
  const sleeps: number[] = [];
  const client = new LlmGateway({
    chains: options.chain ?? chains(),
    retriesPerModel: options.retries ?? 1,
    budget,
    catalog: { prices: async () => options.priceMap ?? prices() },
    transport: async (request) => {
      calls.push(request.model);
      const next = options.script.shift();
      if (!next) throw new Error("sin guion");
      return next;
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0,
    now: () => new Date("2026-10-14T12:00:00.000Z"),
    estimateTokens: () => 100,
  });
  return { client, calls, sleeps, budget };
}

const base = {
  userId: "user-1",
  feature: "vega.crisis",
  messages: [{ role: "user" as const, content: "resume" }],
  maxTokens: 100,
  budgetUsd: 5,
};

test("clasifica reintento, aborto y salto", () => {
  assert.equal(classifyAttempt({ status: 429, body: null }), "retry");
  assert.equal(classifyAttempt({ status: 500, body: null }), "retry");
  assert.equal(classifyAttempt({ status: 200, body: { error: { message: "vacío" } } }), "retry");
  assert.equal(classifyAttempt({ status: 200, body: { choices: [{ message: { content: "  " } }] } }), "retry");
  assert.equal(classifyAttempt({ status: 200, body: { choices: [{ message: { content: "ok" } }] } }), "ok");
  assert.equal(classifyAttempt({ status: 401, body: null }), "abort");
  assert.equal(classifyAttempt({ status: 403, body: null }), "abort");
  assert.equal(classifyAttempt({ status: 400, body: null }), "skip");
  assert.equal(classifyAttempt({ status: 408, body: null }), "skip");
  assert.equal(classifyAttempt({ status: 0, body: null, timedOut: true }), "retry");
});

test("el backoff lleva jitter y queda entre la mitad y 1.5 del exponencial", () => {
  assert.equal(backoffMs(0, () => 0), 100);
  assert.equal(backoffMs(0, () => 1), 300);
  assert.equal(backoffMs(2, () => 0), 400);
  assert.ok(backoffMs(10, () => 1) <= 7_500);
});

test("la ruta de degradación baja de tier", () => {
  assert.deepEqual(downgradePath("premium"), ["premium", "balanced", "cheap"]);
  assert.deepEqual(downgradePath("cheap"), ["cheap"]);
  assert.equal(monthKey(new Date("2026-10-14T00:00:00.000Z")), "2026-10");
  assert.deepEqual(readChains({ LLM_CHAIN_CHEAP: " a, b ,, c " }), { cheap: ["a", "b", "c"], balanced: [], premium: [] });
  assert.equal(readRetries(undefined), 2);
  assert.throws(() => readRetries("9"), /LLM_RETRIES_PER_MODEL/);
});

test("reintenta un 429 y usa usage.cost", async () => {
  const { client, calls, sleeps, budget } = gateway({
    script: [ { status: 429, body: null }, ok("listo", 0.25) ],
  });
  const result = await client.complete({ ...base, tier: "cheap" });
  assert.equal(result.text, "listo");
  assert.equal(result.costUsd, 0.25);
  assert.deepEqual(calls, ["cheap-model", "cheap-model"]);
  assert.equal(sleeps.length, 1);
  assert.equal(budget.spend.get("user-1:2026-10"), 0.25);
  assert.equal(budget.features.get("user-1:2026-10:vega.crisis"), 0.25);
  assert.equal(budget.events[0]?.status, "ok");
  assert.equal(JSON.stringify(budget.events).includes("resume"), false);
});

test("un 401 aborta sin probar el siguiente modelo", async () => {
  const { client, calls } = gateway({
    chain: { cheap: ["cheap-model", "otro"], balanced: [], premium: [] },
    script: [{ status: 401, body: null }, ok("no") ],
    retries: 2,
  });
  await assert.rejects(() => client.complete({ ...base, tier: "cheap" }), LlmAuthError);
  assert.deepEqual(calls, ["cheap-model"]);
});

test("un 400 salta de modelo sin reintento", async () => {
  const { client, calls, sleeps } = gateway({
    chain: { cheap: ["cheap-model", "otro-barato"], balanced: [], premium: [] },
    priceMap: new Map([
      ["cheap-model", { promptPerToken: 0.001, completionPerToken: 0.001 }],
      ["otro-barato", { promptPerToken: 0.001, completionPerToken: 0.001 }],
    ]),
    script: [{ status: 400, body: { error: "bad" } }, ok("siguió", 0.1) ],
  });
  const result = await client.complete({ ...base, tier: "cheap" });
  assert.equal(result.model, "otro-barato");
  assert.deepEqual(calls, ["cheap-model", "otro-barato"]);
  assert.equal(sleeps.length, 0);
});

test("agota los reintentos y pasa al siguiente modelo", async () => {
  const { client, calls } = gateway({
    chain: { cheap: ["cheap-model", "otro-barato"], balanced: [], premium: [] },
    priceMap: new Map([
      ["cheap-model", { promptPerToken: 0.001, completionPerToken: 0.001 }],
      ["otro-barato", { promptPerToken: 0.001, completionPerToken: 0.001 }],
    ]),
    retries: 1,
    script: [
      { status: 200, body: { error: { message: "vacío" } } },
      { status: 200, body: { choices: [] } },
      ok("ahora", 0.05),
    ],
  });
  const result = await client.complete({ ...base, tier: "cheap" });
  assert.equal(result.text, "ahora");
  assert.deepEqual(calls, ["cheap-model", "cheap-model", "otro-barato"]);
});

test("sin usage.cost calcula con el catálogo", async () => {
  const { client, budget } = gateway({ script: [ok("texto")] });
  const result = await client.complete({ ...base, tier: "cheap" });
  assert.equal(result.costUsd, 10 * 0.001 + 4 * 0.001);
  assert.equal(budget.events.at(-1)?.costUsd, result.costUsd);
});

test("un modelo sin precio no se llama", async () => {
  const { client, calls } = gateway({
    chain: { cheap: ["fantasma", "cheap-model"], balanced: [], premium: [] },
    script: [ok("visible", 0.01)],
  });
  const result = await client.complete({ ...base, tier: "cheap" });
  assert.equal(result.model, "cheap-model");
  assert.deepEqual(calls, ["cheap-model"]);
});

test("si el peor caso no cabe, baja de tier", async () => {
  const { client, calls } = gateway({
    script: [ok("barato", 0.02)],
    budgetUsd: 1,
  });
  const result = await client.complete({ ...base, tier: "premium", budgetUsd: 1 });
  assert.equal(result.tier, "cheap");
  assert.equal(result.degraded, true);
  assert.deepEqual(calls, ["cheap-model"]);
});

test("BudgetExceededError solo si ni el tier barato cabe", async () => {
  const { client, calls, budget } = gateway({ script: [ok("no")], budgetUsd: 0.1 });
  await assert.rejects(() => client.complete({ ...base, tier: "premium", budgetUsd: 0.1 }), BudgetExceededError);
  assert.deepEqual(calls, []);
  assert.equal(budget.events.at(-1)?.status, "budget_exceeded");
});

test("si ningún modelo tiene precio, no es un exceso de presupuesto", async () => {
  const { client } = gateway({ priceMap: new Map(), script: [] });
  await assert.rejects(() => client.complete({ ...base, tier: "cheap" }), LlmUnavailableError);
});

test("js-tiktoken estima más tokens en un texto más largo", () => {
  const short = estimateTokens("hola");
  const long = estimateTokens("hola mundo desde lyra");
  assert.ok(short > 0);
  assert.ok(long > short);
});
