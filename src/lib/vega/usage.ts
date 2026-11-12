/** Uso de tokens y costo estimado de las llamadas al modelo de Vega. */

export type ModelUsage = {
  provider: "gemini" | "openrouter";
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Costo real si el proveedor lo informa (OpenRouter); si no, null y se estima. */
  reportedCostUsd: number | null;
};

/** USD por millón de tokens (entrada, salida). Solo para estimar; revisa los precios del proveedor. */
const pricesPerMillion: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
};

function priceFor(model: string) {
  const bare = model.includes("/") ? model.slice(model.indexOf("/") + 1) : model;
  return pricesPerMillion[bare] ?? null;
}

export function estimateCostUsd(usage: Pick<ModelUsage, "model" | "inputTokens" | "outputTokens" | "reportedCostUsd">) {
  if (usage.reportedCostUsd !== null && Number.isFinite(usage.reportedCostUsd)) return usage.reportedCostUsd;
  const price = priceFor(usage.model);
  if (!price) return null;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}

export type TurnUsage = {
  calls: number;
  providers: string[];
  inputTokens: number;
  outputTokens: number;
  /** null si algún modelo no tiene precio conocido. */
  costUsd: number | null;
};

export function summarizeUsage(calls: ModelUsage[]): TurnUsage {
  let costUsd: number | null = 0;
  for (const call of calls) {
    const cost = estimateCostUsd(call);
    costUsd = cost === null || costUsd === null ? null : costUsd + cost;
  }
  return {
    calls: calls.length,
    providers: [...new Set(calls.map((call) => `${call.provider}:${call.model}`))],
    inputTokens: calls.reduce((sum, call) => sum + call.inputTokens, 0),
    outputTokens: calls.reduce((sum, call) => sum + call.outputTokens, 0),
    costUsd: costUsd === null ? null : Math.round(costUsd * 1_000_000) / 1_000_000,
  };
}
