// Topes y precios de X API para Vega (Fase 8).
//
// Precios de X API (pago por uso, sin suscripción), revisados el 2026-11-12 en
// https://docs.x.com/x-api/getting-started/pricing:
//   Posts: Read $0.005 por post devuelto · User: Read $0.010 por usuario · Counts: Recent $0.005 por solicitud.
//   X no cobra dos veces el mismo post en el mismo día UTC (deduplicación «suave»), no cobra solicitudes fallidas
//   y limita a 3 millones de posts leídos por ciclo mensual.
// Límite de ritmo (https://docs.x.com/x-api/fundamentals/rate-limits): búsqueda reciente 450 solicitudes / 15 min
// por app; conteos recientes 300 / 15 min. La búsqueda reciente solo cubre los últimos 7 días.
import { costTierFor, type CostTier } from "@/lib/vega/cost-cap";
import { DEFAULT_TIMEZONE, zonedParts } from "@/lib/vega/schedule";

type Env = Record<string, string | undefined>;

export const X_PRICES_CHECKED_AT = "2026-11-12";

function readNumber(raw: string | undefined, fallback: number, min: number, max: number) {
  const value = Number.parseFloat(raw ?? "");
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

const isOff = (raw: string | undefined) => ["off", "false", "0", "no"].includes(raw?.trim().toLowerCase() ?? "");

const dailyDefaults: Record<CostTier, number> = { inicio: 50, negocio: 150, pro: 400 };
const monitorDefaults: Record<CostTier, number> = { inicio: 1, negocio: 3, pro: 5 };

export type XUserCtx = { id: string; package: string | null; role?: string | null };

export function xSettings(env: Env = process.env) {
  return {
    enabled: !isOff(env.VEGA_X),
    globalDailyPosts: Math.round(readNumber(env.VEGA_X_GLOBAL_DAILY_POSTS, 3000, 0, 3_000_000)),
    cacheMinutes: readNumber(env.VEGA_X_CACHE_MINUTES, 15, 0, 1440),
    monitorMinMinutes: Math.round(readNumber(env.VEGA_X_MONITOR_MIN_MINUTES, 60, 15, 1440)),
    monitorMaxPosts: Math.round(readNumber(env.VEGA_X_MONITOR_MAX_POSTS, 25, 10, 100)),
    countInCostCap: !isOff(env.VEGA_X_COUNT_IN_COST_CAP),
    prices: {
      post: readNumber(env.VEGA_X_PRICE_POST, 0.005, 0, 1),
      user: readNumber(env.VEGA_X_PRICE_USER, 0.01, 0, 1),
      counts: readNumber(env.VEGA_X_PRICE_COUNTS, 0.005, 0, 1),
    },
  };
}

function tierKey(tier: CostTier) {
  return tier.toUpperCase();
}

/** Posts de X que un socio puede leer al día (los conteos cuentan como 1). null = sin plan. */
export function dailyPostCap(user: XUserCtx, env: Env = process.env): number | null {
  if (user.role === "ADMIN") return Math.round(readNumber(env.VEGA_X_DAILY_POSTS_ADMIN, 1000, 0, 1_000_000));
  const tier = costTierFor(user.package);
  if (!tier) return null;
  return Math.round(readNumber(env[`VEGA_X_DAILY_POSTS_${tierKey(tier)}`], dailyDefaults[tier], 0, 1_000_000));
}

/** Monitores de X activos o en pausa por socio. */
export function monitorCap(user: XUserCtx, env: Env = process.env): number {
  if (user.role === "ADMIN") return 10;
  const tier = costTierFor(user.package);
  if (!tier) return 0;
  return Math.round(readNumber(env[`VEGA_X_MONITORS_${tierKey(tier)}`], monitorDefaults[tier], 0, 50));
}

/** Día de los topes: YYYY-MM-DD en Ciudad de México. */
export function xDay(now: Date) {
  const parts = zonedParts(now, DEFAULT_TIMEZONE);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function xCallCost(input: { posts: number; users: number; counts: number }, env: Env = process.env) {
  const { prices } = xSettings(env);
  return Math.round((input.posts * prices.post + input.users * prices.user + input.counts * prices.counts) * 1_000_000) / 1_000_000;
}
