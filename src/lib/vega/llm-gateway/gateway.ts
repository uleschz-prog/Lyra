import { logVega } from "../log";
import { BudgetExceededError, LlmAuthError, LlmUnavailableError, PricingAuthError } from "./errors";
import { backoffMs, calculatedCost, classifyAttempt, extractAssistantText, usageCost, worstCaseCost } from "./fallback";
import type { BudgetStore } from "./budget-ledger";
import type { PriceSource } from "./pricing-catalog";
import type { CompleteInput, LlmChains, LlmEvent, LlmResult, LlmTier, ModelPrice, TransportRequest, TransportResult } from "./types";
import { downgradePath, monthKey, sanitizeFeature } from "./types";

export type GatewayDeps = {
  chains: LlmChains;
  retriesPerModel: number;
  budget: BudgetStore;
  catalog: PriceSource;
  transport: (request: TransportRequest) => Promise<TransportResult>;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  now: () => Date;
  estimateTokens: (text: string) => number;
};

type PricedModel = { id: string; worst: number; price: ModelPrice };

export class LlmGateway {
  constructor(private readonly deps: GatewayDeps) {}

  async complete(input: CompleteInput): Promise<LlmResult> {
    if (!input.userId.trim()) throw new LlmUnavailableError("Falta el usuario del presupuesto.");
    if (input.messages.length === 0) throw new LlmUnavailableError("La solicitud no trae mensajes.");
    const maxTokens = Math.floor(input.maxTokens);
    if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 4_000) {
      throw new LlmUnavailableError("maxTokens está fuera de rango.");
    }
    if (!Number.isFinite(input.budgetUsd) || input.budgetUsd < 0) {
      throw new BudgetExceededError(0, Number.POSITIVE_INFINITY);
    }

    const month = monthKey(this.deps.now());
    const feature = sanitizeFeature(input.feature);
    let prices: Map<string, ModelPrice>;
    try {
      prices = await this.deps.catalog.prices();
    } catch (error) {
      if (error instanceof PricingAuthError) {
        await this.event({ input, feature, month, status: "auth_error", tier: input.tier, model: null, costUsd: null, degraded: false });
        throw new LlmAuthError();
      }
      throw new LlmUnavailableError("No se pudo leer el catálogo de precios.");
    }

    const spent = await this.deps.budget.getSpend(input.userId, month);
    const remaining = Math.max(0, input.budgetUsd - spent);
    const promptText = input.messages.map((message) => message.content).join("\n");
    const promptTokens = this.deps.estimateTokens(promptText);
    const selected = this.selectTier(input.tier, prices, promptTokens, maxTokens, remaining);

    if (!selected) {
      const cheap = this.priced("cheap", prices, promptTokens, maxTokens);
      if (cheap.length === 0) {
        await this.event({ input, feature, month, status: "unavailable", tier: input.tier, model: null, costUsd: null, degraded: false });
        throw new LlmUnavailableError("Ningún modelo de la cadena tiene precio.");
      }
      const worst = Math.min(...cheap.map((model) => model.worst));
      await this.event({
        input,
        feature,
        month,
        status: "budget_exceeded",
        tier: "cheap",
        model: null,
        costUsd: null,
        degraded: input.tier !== "cheap",
      });
      throw new BudgetExceededError(remaining, worst);
    }

    const temperature = input.temperature ?? 0.2;
    let sawModel = false;
    for (const model of selected.models) {
      sawModel = true;
      const attempts = this.deps.retriesPerModel + 1;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (attempt > 0) await this.deps.sleep(backoffMs(attempt - 1, this.deps.random));
        let result: TransportResult;
        try {
          result = await this.deps.transport({
            model: model.id,
            messages: input.messages,
            maxTokens,
            temperature,
          });
        } catch {
          continue;
        }
        const kind = classifyAttempt(result);
        if (kind === "abort") {
          await this.event({
            input,
            feature,
            month,
            status: "auth_error",
            tier: selected.tier,
            model: model.id,
            costUsd: null,
            degraded: selected.tier !== input.tier,
          });
          throw new LlmAuthError();
        }
        if (kind === "skip") break;
        if (kind === "retry") continue;

        const text = extractAssistantText(result.body) ?? "";
        const direct = usageCost(result.body);
        const cost = direct ?? calculatedCost(result.body, model.price, promptTokens, this.deps.estimateTokens(text));
        const billed = Number.isFinite(cost) && cost >= 0 ? cost : model.worst;
        const spentUsd = await this.deps.budget.addSpend(input.userId, month, billed, feature);
        await this.event({
          input,
          feature,
          month,
          status: "ok",
          tier: selected.tier,
          model: model.id,
          costUsd: billed,
          degraded: selected.tier !== input.tier,
        });
        logVega("info", "vega.llm.ok", {
          userId: input.userId,
          feature,
          model: model.id,
          tier: selected.tier,
          costUsd: billed,
          degraded: selected.tier !== input.tier,
        });
        return {
          text,
          model: model.id,
          tier: selected.tier,
          requestedTier: input.tier,
          costUsd: billed,
          degraded: selected.tier !== input.tier,
          spentUsd,
        };
      }
    }

    await this.event({
      input,
      feature,
      month,
      status: "unavailable",
      tier: selected.tier,
      model: null,
      costUsd: null,
      degraded: selected.tier !== input.tier,
    });
    throw new LlmUnavailableError(sawModel ? "Ningún modelo de la cadena pudo responder." : "La cadena del tier está vacía.");
  }

  private selectTier(
    requested: LlmTier,
    prices: Map<string, ModelPrice>,
    promptTokens: number,
    maxTokens: number,
    remaining: number,
  ): { tier: LlmTier; models: PricedModel[] } | null {
    for (const tier of downgradePath(requested)) {
      const affordable = this.priced(tier, prices, promptTokens, maxTokens).filter((model) => model.worst <= remaining + 1e-9);
      if (affordable.length > 0) return { tier, models: affordable };
    }
    return null;
  }

  private priced(tier: LlmTier, prices: Map<string, ModelPrice>, promptTokens: number, maxTokens: number): PricedModel[] {
    const models: PricedModel[] = [];
    for (const id of this.deps.chains[tier]) {
      const price = prices.get(id);
      if (!price) continue;
      const worst = worstCaseCost(promptTokens, maxTokens, price);
      if (!Number.isFinite(worst)) continue;
      models.push({ id, worst, price });
    }
    return models;
  }

  private async event(input: {
    input: CompleteInput;
    feature: string;
    month: string;
    status: LlmEvent["status"];
    tier: string;
    model: string | null;
    costUsd: number | null;
    degraded: boolean;
  }) {
    await this.deps.budget.recordEvent({
      ts: this.deps.now().toISOString(),
      userId: input.input.userId,
      feature: input.feature,
      tier: input.tier,
      requestedTier: input.input.tier,
      model: input.model,
      costUsd: input.costUsd,
      status: input.status,
      month: input.month,
      degraded: input.degraded,
    });
  }
}
