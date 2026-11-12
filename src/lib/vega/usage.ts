/** Uso de tokens y costo en USD de las llamadas al modelo de Vega. */
import { callCostUsd, turnCostUsd, type CostSource } from "@/lib/vega/cost";

export type ModelUsage = {
  provider: "gemini" | "openrouter";
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Costo real si el proveedor lo informa (OpenRouter); si no, null y se calcula con la tabla. */
  reportedCostUsd: number | null;
};

/** Costo de una llamada (siempre un número: modelos sin precio usan un precio por defecto alto). */
export function estimateCostUsd(usage: Pick<ModelUsage, "model" | "inputTokens" | "outputTokens" | "reportedCostUsd">) {
  return callCostUsd(usage).costUsd;
}

export type TurnUsage = {
  calls: number;
  providers: string[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** De dónde salió el costo: reportado por el proveedor, tabla de precios o precio por defecto. */
  costSource: CostSource;
};

export function summarizeUsage(calls: ModelUsage[]): TurnUsage {
  const cost = turnCostUsd(calls);
  return {
    calls: calls.length,
    providers: [...new Set(calls.map((call) => `${call.provider}:${call.model}`))],
    inputTokens: calls.reduce((sum, call) => sum + call.inputTokens, 0),
    outputTokens: calls.reduce((sum, call) => sum + call.outputTokens, 0),
    costUsd: cost.costUsd,
    costSource: cost.source,
  };
}
