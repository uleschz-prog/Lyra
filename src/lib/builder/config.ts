// Configuración del generador v2 (PR C). Todo se lee de variables de entorno con valores seguros.
import { costTierFor } from "@/lib/vega/cost-cap";
import { DEFAULT_TIMEZONE, zonedParts, zonedToUtc } from "@/lib/vega/schedule";

type Env = Record<string, string | undefined>;

export const builderGenerator = "vega-v2";
export const defaultBuilderModel = "gemini-2.5-flash";

function isOff(raw: string | undefined) {
  return ["off", "false", "0", "no"].includes(raw?.trim().toLowerCase() ?? "");
}

function readInt(raw: string | undefined, fallback: number, min: number, max: number) {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** VEGA_BUILDER=off apaga el generador v2 y Vega entrega con la plantilla v1. */
export function builderEnabled(env: Env = process.env) {
  return !isOff(env.VEGA_BUILDER);
}

export function builderModels(env: Env = process.env) {
  const gemini = env.VEGA_BUILDER_MODEL?.trim() || defaultBuilderModel;
  const openrouter = env.VEGA_BUILDER_OPENROUTER_MODEL?.trim() || (gemini.includes("/") ? gemini : `google/${gemini}`);
  return { gemini, openrouter };
}

export type BuildPriceKind = "sitio" | "app" | "edit" | "agente";

/** Créditos por trabajo (decisión de Ule): sitio/app 10, edición 2, agente 5. Fuera del tope del 5 %. */
export function builderPrice(kind: BuildPriceKind, env: Env = process.env) {
  if (kind === "sitio") return readInt(env.VEGA_BUILDER_PRICE_SITE, 10, 0, 1000);
  if (kind === "app") return readInt(env.VEGA_BUILDER_PRICE_APP, 10, 0, 1000);
  if (kind === "edit") return readInt(env.VEGA_BUILDER_PRICE_EDIT, 2, 0, 1000);
  return readInt(env.VEGA_BUILDER_PRICE_AGENT, 5, 0, 1000);
}

/** Construcciones por día (CDMX) según plan. Admin sin límite. */
export function builderDailyLimit(user: { package: string | null; role?: string | null }, env: Env = process.env): number | null {
  if (user.role === "ADMIN") return null;
  const tier = costTierFor(user.package);
  if (tier === "pro") return readInt(env.VEGA_BUILDER_DAILY_PRO, 40, 0, 1000);
  if (tier === "negocio") return readInt(env.VEGA_BUILDER_DAILY_NEGOCIO, 15, 0, 1000);
  if (tier === "inicio") return readInt(env.VEGA_BUILDER_DAILY_INICIO, 5, 0, 1000);
  return readInt(env.VEGA_BUILDER_DAILY_DEFAULT, 2, 0, 1000);
}

/** Inicio del día actual en Ciudad de México. */
export function builderDayStart(now: Date) {
  const parts = zonedParts(now, DEFAULT_TIMEZONE);
  return zonedToUtc(parts.year, parts.month, parts.day, 0, 0, DEFAULT_TIMEZONE);
}

/** Límites de tamaño de un proyecto v2. */
export const builderLimits = {
  maxFiles: 150,
  maxBytes: 3_000_000,
  maxFileBytes: 120_000,
  /** Archivos que se generan en paralelo por paso. */
  parallelFiles: 4,
  /** Tiempo máximo de una llamada al modelo (el paso completo debe caber en 60 s). */
  modelTimeoutMs: 38_000,
  /** Presupuesto de una invocación que avanza el trabajo. */
  stepBudgetMs: 48_000,
  /** Rondas de reparación tras validar. */
  repairRounds: 2,
  /** Intentos por archivo antes de usar la sección de la biblioteca. */
  fileAttempts: 2,
  /** Un trabajo sin avance en este tiempo se da por perdido (se reembolsa). */
  staleMs: 30 * 60_000,
  /** Candado de una invocación. */
  leaseMs: 65_000,
};
