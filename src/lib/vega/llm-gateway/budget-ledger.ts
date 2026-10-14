import { Redis } from "@upstash/redis";

import type { LlmEvent } from "./types";
import { safeUserId, sanitizeFeature } from "./types";

const EVENT_KEY = "llm:events";
const MONTH_TTL_SECONDS = 40 * 24 * 60 * 60;

export interface BudgetStore {
  getSpend(userId: string, month: string): Promise<number>;
  addSpend(userId: string, month: string, amount: number, feature: string): Promise<number>;
  recordEvent(event: LlmEvent): Promise<void>;
}

export interface RedisLike {
  incrbyfloat(key: string, value: number): Promise<number | string>;
  get(key: string): Promise<string | number | null>;
  expire(key: string, seconds: number): Promise<unknown>;
  lpush(key: string, ...values: string[]): Promise<number>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
}

export class RedisBudgetLedger implements BudgetStore {
  constructor(private readonly redis: RedisLike) {}

  async getSpend(userId: string, month: string): Promise<number> {
    const raw = await this.redis.get(spendKey(userId, month));
    const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : 0;
    return Number.isFinite(value) ? value : 0;
  }

  async addSpend(userId: string, month: string, amount: number, feature: string): Promise<number> {
    const spend = Number(await this.redis.incrbyfloat(spendKey(userId, month), amount));
    if (!Number.isFinite(spend)) throw new Error("Redis no devolvió el gasto acumulado.");
    const featureSpend = Number(await this.redis.incrbyfloat(featureKey(userId, month, feature), amount));
    if (!Number.isFinite(featureSpend)) throw new Error("Redis no devolvió el gasto por función.");
    await this.redis.expire(spendKey(userId, month), MONTH_TTL_SECONDS);
    await this.redis.expire(featureKey(userId, month, feature), MONTH_TTL_SECONDS);
    return spend;
  }

  async recordEvent(event: LlmEvent): Promise<void> {
    await this.redis.lpush(EVENT_KEY, JSON.stringify(event));
    await this.redis.ltrim(EVENT_KEY, 0, 999);
  }
}

export function spendKey(userId: string, month: string): string {
  return `llm:spend:${safeUserId(userId)}:${month}`;
}

export function featureKey(userId: string, month: string, feature: string): string {
  return `${spendKey(userId, month)}:feature:${sanitizeFeature(feature)}`;
}

export function createRedisBudgetLedger(redis: RedisLike = redisFromEnv()): BudgetStore {
  return new RedisBudgetLedger(redis);
}

export function redisFromEnv(env: NodeJS.ProcessEnv = process.env): Redis {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error("Faltan UPSTASH_REDIS_REST_URL o UPSTASH_REDIS_REST_TOKEN.");
  }
  return new Redis({ url, token });
}
