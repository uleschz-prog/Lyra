import { PricingAuthError, PricingCatalogError } from "./errors";
import type { ModelPrice } from "./types";

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
export const PRICING_TTL_MS = 6 * 60 * 60 * 1000;

export interface PriceSource {
  prices(): Promise<Map<string, ModelPrice>>;
}

type CatalogDeps = {
  fetch: typeof fetch;
  now: () => number;
  ttlMs?: number;
  apiKey?: string;
};

export class PricingCatalog implements PriceSource {
  private cached: { at: number; prices: Map<string, ModelPrice> } | null = null;

  constructor(private readonly deps: CatalogDeps) {}

  async prices(): Promise<Map<string, ModelPrice>> {
    const ttl = this.deps.ttlMs ?? PRICING_TTL_MS;
    const now = this.deps.now();
    if (this.cached && now - this.cached.at < ttl) return this.cached.prices;
    const loaded = await this.load();
    this.cached = { at: now, prices: loaded };
    return loaded;
  }

  private async load(): Promise<Map<string, ModelPrice>> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (this.deps.apiKey) headers.authorization = `Bearer ${this.deps.apiKey}`;

    let response: Response;
    try {
      response = await this.deps.fetch(OPENROUTER_MODELS_URL, { headers });
    } catch {
      throw new PricingCatalogError();
    }

    if (response.status === 401 || response.status === 403) throw new PricingAuthError();
    if (!response.ok) throw new PricingCatalogError();

    const body = (await response.json().catch(() => null)) as { data?: unknown } | null;
    if (!body || !Array.isArray(body.data)) throw new PricingCatalogError();

    const prices = new Map<string, ModelPrice>();
    for (const item of body.data) {
      if (!item || typeof item !== "object") continue;
      const row = item as { id?: unknown; pricing?: { prompt?: unknown; completion?: unknown } };
      if (typeof row.id !== "string" || !row.id) continue;
      const price = parsePrice(row.pricing?.prompt, row.pricing?.completion);
      if (price) prices.set(row.id, price);
    }
    return prices;
  }
}

function parsePrice(prompt: unknown, completion: unknown): ModelPrice | null {
  const promptPerToken = typeof prompt === "string" || typeof prompt === "number" ? Number(prompt) : Number.NaN;
  const completionPerToken = typeof completion === "string" || typeof completion === "number" ? Number(completion) : Number.NaN;
  if (!Number.isFinite(promptPerToken) || !Number.isFinite(completionPerToken)) return null;
  if (promptPerToken < 0 || completionPerToken < 0) return null;
  return { promptPerToken, completionPerToken };
}
