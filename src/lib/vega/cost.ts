// Costo real en USD de las llamadas al modelo de Vega (Fase 7).
//
// Precios en USD por millón de tokens, nivel de pago estándar, revisados el 2026-11-12 en
// https://ai.google.dev/gemini-api/docs/pricing y https://openrouter.ai/api/v1/models.
// Cuando un precio tiene fecha de aumento ya anunciada se usa el precio más alto (conservador).
// Se pueden sobrescribir o agregar con VEGA_MODEL_PRICES (JSON) sin tocar código.

export type ModelPrice = { input: number; output: number };
export type CostSource = "reported" | "table" | "default";

export const PRICES_CHECKED_AT = "2026-11-12";

export const builtinModelPrices: Record<string, ModelPrice> = {
  // Gemini directo (las mismas tarifas aplican vía OpenRouter con prefijo google/).
  "gemini-2.5-flash": { input: 0.3, output: 2.5 }, // desde el 1-dic-2026 se cobra como gemini-3.5-flash-lite (mismo precio)
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-2.5-pro": { input: 1.25, output: 10 }, // prompts ≤200k tokens
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
  "gemini-3-flash-preview": { input: 0.5, output: 3 },
  "gemini-3.1-pro-preview": { input: 2, output: 12 }, // prompts ≤200k tokens
  "gemini-3.6-flash": { input: 1.5, output: 7.5 }, // $0.75/$3.75 hasta el 31-dic-2026; se usa el precio de 2027
  "gemini-3.8-flash": { input: 1.5, output: 7.5 }, // ídem (OpenRouter hoy: $0.825/$4.125)
  // Respaldos comunes en OpenRouter.
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

/** Precio para modelos desconocidos: alto a propósito para que el tope no se quede corto. */
export const fallbackModelPrice: ModelPrice = { input: 1.5, output: 7.5 };

function validPrice(value: unknown): value is ModelPrice {
  if (!value || typeof value !== "object") return false;
  const { input, output } = value as Record<string, unknown>;
  return typeof input === "number" && typeof output === "number" && input >= 0 && output >= 0 && input < 1000 && output < 1000;
}

/** Tabla efectiva: la integrada más VEGA_MODEL_PRICES = {"modelo":{"input":0.3,"output":2.5}}. */
export function modelPriceTable(env: Record<string, string | undefined> = process.env): Record<string, ModelPrice> {
  const table: Record<string, ModelPrice> = { ...builtinModelPrices };
  const raw = env.VEGA_MODEL_PRICES?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [model, price] of Object.entries(parsed ?? {})) {
        if (validPrice(price)) table[bareModel(model)] = { input: price.input, output: price.output };
      }
    } catch {
      console.warn("[Vega cost] VEGA_MODEL_PRICES no es JSON válido; se ignora");
    }
  }
  return table;
}

export function defaultModelPrice(env: Record<string, string | undefined> = process.env): ModelPrice {
  const [input, output] = (env.VEGA_COST_DEFAULT_PRICE ?? "").split(",").map((value) => Number.parseFloat(value));
  return validPrice({ input, output }) ? { input, output } : fallbackModelPrice;
}

/** «google/gemini-2.5-flash» → «gemini-2.5-flash»; quita también el sufijo «models/». */
export function bareModel(model: string) {
  const trimmed = model.trim().toLowerCase().replace(/^models\//, "");
  return trimmed.includes("/") ? trimmed.slice(trimmed.lastIndexOf("/") + 1) : trimmed;
}

export function priceFor(model: string, env: Record<string, string | undefined> = process.env): { price: ModelPrice; source: "table" | "default" } {
  const table = modelPriceTable(env);
  const bare = bareModel(model);
  if (table[bare]) return { price: table[bare], source: "table" };
  // Variantes con sufijo de versión (p. ej. «gemini-2.5-flash-001», «…-preview-09-2025»): el prefijo más largo.
  const prefix = Object.keys(table)
    .filter((key) => bare.startsWith(`${key}-`))
    .sort((a, b) => b.length - a.length)[0];
  if (prefix) return { price: table[prefix], source: "table" };
  return { price: defaultModelPrice(env), source: "default" };
}

export type CallForCost = { model: string; inputTokens: number; outputTokens: number; reportedCostUsd: number | null };

/** Costo de una llamada: el que reporta el proveedor (OpenRouter) o tokens × tabla. */
export function callCostUsd(call: CallForCost, env: Record<string, string | undefined> = process.env): { costUsd: number; source: CostSource } {
  if (call.reportedCostUsd !== null && Number.isFinite(call.reportedCostUsd) && call.reportedCostUsd >= 0) {
    return { costUsd: call.reportedCostUsd, source: "reported" };
  }
  const { price, source } = priceFor(call.model, env);
  const input = Math.max(0, call.inputTokens || 0);
  const output = Math.max(0, call.outputTokens || 0);
  return { costUsd: (input * price.input + output * price.output) / 1_000_000, source };
}

const sourceRank: Record<CostSource, number> = { reported: 0, table: 1, default: 2 };

export function turnCostUsd(calls: CallForCost[], env: Record<string, string | undefined> = process.env) {
  let costUsd = 0;
  let source: CostSource = "reported";
  for (const call of calls) {
    const cost = callCostUsd(call, env);
    costUsd += cost.costUsd;
    if (sourceRank[cost.source] > sourceRank[source]) source = cost.source;
  }
  return { costUsd: Math.round(costUsd * 1_000_000) / 1_000_000, source: calls.length ? source : ("table" as CostSource) };
}

/** ¿El modelo `cheaper` cuesta menos que `current` (promedio 4:1 entrada/salida)? */
export function isCheaper(cheaper: string, current: string, env: Record<string, string | undefined> = process.env) {
  const blend = (price: ModelPrice) => price.input * 0.8 + price.output * 0.2;
  return blend(priceFor(cheaper, env).price) < blend(priceFor(current, env).price);
}
