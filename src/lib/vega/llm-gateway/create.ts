import { readBudgetRatio } from "../budget-policy";
import { createRedisBudgetLedger, redisFromEnv } from "./budget-ledger";
import { LlmGateway, type GatewayDeps } from "./gateway";
import { PricingCatalog } from "./pricing-catalog";
import { estimateTokens } from "./tokens";
import { openRouterTransport } from "./transport";
import { readChains, readRetries, readTimeoutMs } from "./types";

export function createGatewayFromEnv(env: NodeJS.ProcessEnv = process.env): LlmGateway {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("Falta OPENROUTER_API_KEY.");
  readBudgetRatio(env.LLM_BUDGET_RATIO);
  const timeoutMs = readTimeoutMs(env.LLM_TIMEOUT_MS);
  const deps: GatewayDeps = {
    chains: readChains(env),
    retriesPerModel: readRetries(env.LLM_RETRIES_PER_MODEL),
    budget: createRedisBudgetLedger(redisFromEnv(env)),
    catalog: new PricingCatalog({
      fetch,
      now: () => Date.now(),
      apiKey,
    }),
    transport: (request) =>
      openRouterTransport(request, {
        fetch,
        apiKey,
        timeoutMs,
        referer: env.NEXT_PUBLIC_APP_URL,
      }),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random: Math.random,
    now: () => new Date(),
    estimateTokens: (text) => estimateTokens(text),
  };
  return new LlmGateway(deps);
}
