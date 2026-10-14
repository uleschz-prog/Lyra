import assert from "node:assert/strict";
import test from "node:test";

import { PricingAuthError, PricingCatalogError } from "./errors";
import { OPENROUTER_MODELS_URL, PRICING_TTL_MS, PricingCatalog } from "./pricing-catalog";

const payload = {
  data: [
    { id: "priced", pricing: { prompt: "0.000001", completion: "0.000002" } },
    { id: "free", pricing: { prompt: "0", completion: "0" } },
    { id: "missing", pricing: {} },
    { id: "negative", pricing: { prompt: "-1", completion: "1" } },
  ],
};

test("el catálogo cachea el GET de modelos seis horas y omite precios ausentes", async () => {
  let now = 0;
  let calls = 0;
  const fetchImpl: typeof fetch = async (url) => {
    calls += 1;
    assert.equal(String(url), OPENROUTER_MODELS_URL);
    return new Response(JSON.stringify(payload), { status: 200 });
  };
  const catalog = new PricingCatalog({ fetch: fetchImpl, now: () => now, ttlMs: PRICING_TTL_MS, apiKey: "test-key" });

  const first = await catalog.prices();
  const second = await catalog.prices();
  assert.equal(calls, 1);
  assert.equal(second, first);
  assert.deepEqual(first.get("priced"), { promptPerToken: 0.000001, completionPerToken: 0.000002 });
  assert.deepEqual(first.get("free"), { promptPerToken: 0, completionPerToken: 0 });
  assert.equal(first.has("missing"), false);
  assert.equal(first.has("negative"), false);

  now = PRICING_TTL_MS;
  await catalog.prices();
  assert.equal(calls, 2);
});

test("un 401 del catálogo no se cachea como precio infinito silencioso", async () => {
  const catalog = new PricingCatalog({
    fetch: async () => new Response("no", { status: 401 }),
    now: () => 0,
  });
  await assert.rejects(() => catalog.prices(), PricingAuthError);
});

test("un catálogo ilegible falla sin inventar precios", async () => {
  const catalog = new PricingCatalog({
    fetch: async () => new Response("no json", { status: 200 }),
    now: () => 0,
  });
  await assert.rejects(() => catalog.prices(), PricingCatalogError);
});
