export type LlmTier = "cheap" | "balanced" | "premium";

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmChains = Record<LlmTier, string[]>;

export type ModelPrice = {
  promptPerToken: number;
  completionPerToken: number;
};

export type CompleteInput = {
  userId: string;
  feature: string;
  tier: LlmTier;
  messages: LlmMessage[];
  maxTokens: number;
  budgetUsd: number;
  temperature?: number;
};

export type LlmResult = {
  text: string;
  model: string;
  tier: LlmTier;
  requestedTier: LlmTier;
  costUsd: number;
  degraded: boolean;
  spentUsd: number;
};

export type TransportRequest = {
  model: string;
  messages: LlmMessage[];
  maxTokens: number;
  temperature: number;
};

export type TransportResult = {
  status: number;
  body: unknown;
  timedOut?: boolean;
  networkError?: boolean;
};

export type LlmEvent = {
  ts: string;
  userId: string;
  feature: string;
  tier: string;
  requestedTier: string;
  model: string | null;
  costUsd: number | null;
  status: "ok" | "budget_exceeded" | "auth_error" | "unavailable";
  month: string;
  degraded: boolean;
};

export function monthKey(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

export function sanitizeFeature(feature: string): string {
  const clean = feature.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40);
  return clean || "vega";
}

export function safeUserId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

const tierOrder: LlmTier[] = ["cheap", "balanced", "premium"];

export function downgradePath(tier: LlmTier): LlmTier[] {
  const index = tierOrder.indexOf(tier);
  const start = index < 0 ? 0 : index;
  return tierOrder.slice(0, start + 1).reverse();
}

export function readChains(env: Record<string, string | undefined>): LlmChains {
  return {
    cheap: splitChain(env.LLM_CHAIN_CHEAP),
    balanced: splitChain(env.LLM_CHAIN_BALANCED),
    premium: splitChain(env.LLM_CHAIN_PREMIUM),
  };
}

export function readRetries(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") return 2;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 5) {
    throw new Error("LLM_RETRIES_PER_MODEL debe ser un entero entre 0 y 5.");
  }
  return value;
}

export function readTimeoutMs(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") return 20_000;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1000 || value > 120_000) {
    throw new Error("LLM_TIMEOUT_MS debe estar entre 1000 y 120000.");
  }
  return value;
}

function splitChain(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
