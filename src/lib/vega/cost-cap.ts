// Tope mensual de costo de IA de Vega por socio (Fase 7).
//
// Tope = VEGA_COST_CAP_PCT (5 %) de la recarga mensual mínima del plan:
//   Inicio $19 → $0.95 · Negocio $49 → $2.45 · Pro $99 → $4.95 (USD de costo de modelo al mes).
// Periodo: mes calendario en America/Mexico_City (se reinicia el día 1 a las 00:00 CDMX).
// Se suma en Postgres (VegaUsageLog) y cuenta chat, WhatsApp y rutinas en segundo plano.
import { getPackage, isPackageId } from "@/config/compensation-plan";
import { getPrisma } from "@/lib/prisma";
import { isCheaper } from "@/lib/vega/cost";
import { DEFAULT_TIMEZONE, zonedParts, zonedToUtc } from "@/lib/vega/schedule";
import type { CostLevel, CostMeterView, CostTier } from "@/lib/vega/cost-shared";
import type { TurnUsage } from "@/lib/vega/usage";

export type { CostLevel, CostMeterView, CostTier } from "@/lib/vega/cost-shared";

type Env = Record<string, string | undefined>;

export const COST_TIMEZONE = DEFAULT_TIMEZONE;
export type UsageSource = "chat" | "whatsapp" | "routine";

/** Recarga mínima mensual (USD) por nivel; la misma que `rebuy` del plan. */
const tierRecharge: Record<CostTier, number> = { inicio: 19, negocio: 49, pro: 99 };

const tierLabels: Record<CostTier, string> = { inicio: "Inicio", negocio: "Negocio", pro: "Pro" };

function readNumber(raw: string | undefined, fallback: number, min: number, max: number) {
  const value = Number.parseFloat(raw ?? "");
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function isOff(raw: string | undefined) {
  return ["off", "false", "0", "no"].includes(raw?.trim().toLowerCase() ?? "");
}

/**
 * Plan → nivel de tope. Los planes anteriores siguen la misma escalera que ya usa
 * compensation-plan: FREE/VEGA/VEGA_PARTNER = Inicio, POLARIS = Negocio,
 * LYRA_MASTER = Pro y CORPORATE (ya no se vende, cobra como Pro) = Pro.
 */
export function costTierFor(packageId: string | null | undefined): CostTier | null {
  if (!packageId || packageId === "NONE" || !isPackageId(packageId)) return null;
  if (packageId === "CORPORATE") return "pro";
  const label = getPackage(packageId).label;
  if (label === "Negocio") return "negocio";
  if (label === "Pro") return "pro";
  return "inicio";
}

/** Recarga mínima del plan (USD). Usa el `rebuy` del catálogo y, si falta, el de su nivel. */
export function minimumRecharge(packageId: string | null | undefined) {
  const tier = costTierFor(packageId);
  if (!tier) return null;
  const rebuy = packageId && isPackageId(packageId) ? getPackage(packageId).rebuy : 0;
  return rebuy > 0 ? rebuy : tierRecharge[tier];
}

export function costCapConfig(env: Env = process.env) {
  return {
    enabled: !isOff(env.VEGA_COST_CAP),
    pct: readNumber(env.VEGA_COST_CAP_PCT, 5, 0.1, 100),
    warnPct: readNumber(env.VEGA_COST_WARN_PCT, 80, 1, 99),
    overrides: {
      inicio: env.VEGA_COST_CAP_INICIO_USD,
      negocio: env.VEGA_COST_CAP_NEGOCIO_USD,
      pro: env.VEGA_COST_CAP_PRO_USD,
    } as Record<CostTier, string | undefined>,
    degrade: {
      enabled: !isOff(env.VEGA_COST_DEGRADE),
      pct: readNumber(env.VEGA_COST_DEGRADE_PCT, 80, 1, 100),
      gemini: env.VEGA_COST_DEGRADE_MODEL?.trim() || "gemini-2.5-flash-lite",
      openrouter: env.VEGA_COST_DEGRADE_OPENROUTER_MODEL?.trim() || "google/gemini-2.5-flash-lite",
    },
  };
}

export type CapUser = { id: string; package: string | null; role?: string | null };

/** Tope mensual en USD, o null si no aplica (apagado, admin o sin plan). */
export function costCapUsd(user: Pick<CapUser, "package" | "role">, env: Env = process.env) {
  const config = costCapConfig(env);
  if (!config.enabled || user.role === "ADMIN") return null;
  const tier = costTierFor(user.package);
  if (!tier) return null;
  const override = Number.parseFloat(config.overrides[tier] ?? "");
  if (Number.isFinite(override) && override >= 0) return Math.round(override * 10_000) / 10_000;
  const recharge = minimumRecharge(user.package) ?? tierRecharge[tier];
  return Math.round(recharge * config.pct * 100) / 10_000; // USD con 4 decimales
}

/** «2026-11»: mes calendario en Ciudad de México. */
export function costMonth(now: Date) {
  const parts = zonedParts(now, COST_TIMEZONE);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

/** Inicio del siguiente mes en Ciudad de México (cuando se reinicia el tope). */
export function costResetsAt(now: Date) {
  const parts = zonedParts(now, COST_TIMEZONE);
  const year = parts.month === 12 ? parts.year + 1 : parts.year;
  const month = parts.month === 12 ? 1 : parts.month + 1;
  return zonedToUtc(year, month, 1, 0, 0, COST_TIMEZONE);
}

export async function spentThisMonth(userId: string, now = new Date()) {
  const result = await getPrisma().vegaUsageLog.aggregate({
    where: { userId, month: costMonth(now) },
    _sum: { costUsd: true },
  });
  return Number(result._sum.costUsd ?? 0);
}

export type CostStatus = {
  level: CostLevel;
  tier: CostTier | null;
  capUsd: number | null;
  spentUsd: number;
  /** 0-100+ (porcentaje del tope usado); 0 si no hay tope. */
  pct: number;
  /** USD que quedan antes del tope (null = sin tope). */
  remainingUsd: number | null;
  resetsAt: Date;
  /** Usar el modelo más barato por estar cerca del tope. */
  degrade: boolean;
};

export async function costStatus(user: CapUser, now = new Date(), env: Env = process.env): Promise<CostStatus> {
  const config = costCapConfig(env);
  const capUsd = costCapUsd(user, env);
  const tier = costTierFor(user.package);
  const resetsAt = costResetsAt(now);
  if (capUsd === null) {
    return { level: "unlimited", tier, capUsd: null, spentUsd: 0, pct: 0, remainingUsd: null, resetsAt, degrade: false };
  }
  const spentUsd = await spentThisMonth(user.id, now);
  const pct = capUsd > 0 ? (spentUsd / capUsd) * 100 : 100;
  const level: CostLevel = pct >= 100 ? "capped" : pct >= config.warnPct ? "warn" : "ok";
  return {
    level,
    tier,
    capUsd,
    spentUsd: Math.round(spentUsd * 1_000_000) / 1_000_000,
    pct: Math.round(pct * 10) / 10,
    remainingUsd: Math.max(0, capUsd - spentUsd),
    resetsAt,
    degrade: config.degrade.enabled && level !== "capped" && pct >= config.degrade.pct,
  };
}

/** Modelos a usar cuando hay que ahorrar; null si el modelo actual ya es igual o más barato. */
export function degradedModels(currentModel: string, env: Env = process.env) {
  const { degrade } = costCapConfig(env);
  if (!isCheaper(degrade.gemini, currentModel, env)) return null;
  return { gemini: degrade.gemini, openrouter: degrade.openrouter };
}

function resetLabel(resetsAt: Date) {
  return resetsAt.toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: COST_TIMEZONE });
}

/** Mensaje para el socio cuando llega al 100 %. */
export function capReachedMessage(status: Pick<CostStatus, "tier" | "resetsAt">) {
  const plan = status.tier ? ` de tu plan ${tierLabels[status.tier]}` : "";
  const upgrade =
    status.tier === "inicio"
      ? " Si necesitas más, el plan Negocio o el Pro te dan un límite mayor."
      : status.tier === "negocio"
        ? " Si necesitas más, el plan Pro te da un límite mayor."
        : "";
  return `Llegaste al límite mensual de uso de IA de Vega${plan}. Se renueva el ${resetLabel(status.resetsAt)}. Mientras tanto puedes revisar tu memoria, archivos, historial y rutinas, y confirmar las acciones pendientes.${upgrade}`;
}

/** Aviso suave (≥ 80 %). */
export function capWarningMessage(status: Pick<CostStatus, "pct" | "resetsAt" | "degrade">) {
  const lighter = status.degrade ? " Para cuidar tu límite, uso un modelo más ligero hasta que se renueve." : "";
  return `Llevas el ${Math.min(99, Math.floor(status.pct))} % de tu uso mensual de IA de Vega; se renueva el ${resetLabel(status.resetsAt)}.${lighter}`;
}

export function meterView(status: CostStatus): CostMeterView {
  return { level: status.level, pct: Math.min(100, status.pct), resetsAt: status.resetsAt.toISOString(), degraded: status.degrade, tier: status.tier };
}

/** Guarda el costo de un turno. Nunca lanza: un fallo de registro no rompe la respuesta. */
export async function recordUsage(input: {
  userId: string;
  conversationId: string | null;
  source: UsageSource;
  usage: TurnUsage;
  degraded?: boolean;
  stopReason?: string | null;
  now?: Date;
}) {
  if (input.usage.calls === 0) return null;
  const now = input.now ?? new Date();
  try {
    return await getPrisma().vegaUsageLog.create({
      data: {
        userId: input.userId,
        conversationId: input.conversationId,
        source: input.source,
        month: costMonth(now),
        models: input.usage.providers,
        calls: input.usage.calls,
        inputTokens: input.usage.inputTokens,
        outputTokens: input.usage.outputTokens,
        costUsd: input.usage.costUsd,
        costSource: input.usage.costSource,
        degraded: input.degraded ?? false,
        stopReason: input.stopReason ?? null,
        createdAt: now,
      },
      select: { id: true },
    });
  } catch (error) {
    console.error("[Vega cost] no se pudo registrar el uso", error instanceof Error ? error.message : typeof error);
    return null;
  }
}
