import assert from "node:assert/strict";
import test from "node:test";

import { featureKey, RedisBudgetLedger, spendKey, type RedisLike } from "./budget-ledger";

class FakeRedis implements RedisLike {
  numbers = new Map<string, number>();
  lists = new Map<string, string[]>();
  expirations = new Map<string, number>();

  async incrbyfloat(key: string, value: number): Promise<number> {
    const next = (this.numbers.get(key) ?? 0) + value;
    this.numbers.set(key, next);
    return next;
  }

  async get(key: string): Promise<number | null> {
    return this.numbers.get(key) ?? null;
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.expirations.set(key, seconds);
    return 1;
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    const list = this.lists.get(key) ?? [];
    list.unshift(...values);
    this.lists.set(key, list);
    return list.length;
  }

  async ltrim(key: string, start: number, stop: number): Promise<string> {
    const list = this.lists.get(key) ?? [];
    this.lists.set(key, list.slice(start, stop + 1));
    return "OK";
  }
}

test("el ledger incrementa con incrbyfloat, separa funciones y registra el evento", async () => {
  const redis = new FakeRedis();
  const ledger = new RedisBudgetLedger(redis);
  const first = await ledger.addSpend("user-1", "2026-10", 0.25, "vega.crisis");
  const second = await ledger.addSpend("user-1", "2026-10", 0.5, "Vega Report!");
  assert.equal(first, 0.25);
  assert.equal(second, 0.75);
  assert.equal(await ledger.getSpend("user-1", "2026-10"), 0.75);
  assert.equal(redis.numbers.get(spendKey("user-1", "2026-10")), 0.75);
  assert.equal(redis.numbers.get(featureKey("user-1", "2026-10", "vega.crisis")), 0.25);
  assert.equal(redis.numbers.get(featureKey("user-1", "2026-10", "vegareport")), 0.5);
  assert.ok(redis.expirations.get(spendKey("user-1", "2026-10")));

  await ledger.recordEvent({
    ts: "2026-10-14T00:00:00.000Z",
    userId: "user-1",
    feature: "vega.crisis",
    tier: "cheap",
    requestedTier: "premium",
    model: "cheap-model",
    costUsd: 0.25,
    status: "ok",
    month: "2026-10",
    degraded: true,
  });
  const raw = redis.lists.get("llm:events")?.[0] ?? "";
  assert.equal(raw.includes("prompt"), false);
  assert.equal(raw.includes("apiKey"), false);
  assert.equal(JSON.parse(raw).costUsd, 0.25);
});
