// Acceso a X API con caché compartida, topes diarios por socio y por plataforma,
// registro de costo y tope mensual de la Fase 7. Nada aquí lanza: siempre devuelve
// { ok: false, error } con un mensaje en español para que Vega no se caiga.
import { createHash } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { capReachedMessage, costMonth, costStatus } from "@/lib/vega/cost-cap";
import {
  parseCounts,
  parseRecentSearch,
  XAuthError,
  xConfig,
  XRateLimitError,
  XRequestError,
  type XCountBucket,
  type XSearchResult,
} from "@/lib/vega/x/client";
import { dailyPostCap, xCallCost, xDay, xSettings, type XUserCtx } from "@/lib/vega/x/limits";

type Env = Record<string, string | undefined>;
export type XKind = "search" | "competitor" | "trends" | "counts" | "monitor";
export type XFailure = { ok: false; error: string; code: "off" | "not_configured" | "no_plan" | "daily_cap" | "global_cap" | "cost_cap" | "rate_limit" | "auth" | "request" | "error" };
export type XOk<T> = { ok: true; data: T; cached: boolean; remainingPosts: number | null };

export type XServiceDeps = { fetch: typeof fetch; env: Env; now: () => Date };
const defaultDeps = (): XServiceDeps => ({ fetch: globalThis.fetch.bind(globalThis), env: process.env, now: () => new Date() });

export const X_NOT_CONFIGURED_MESSAGE =
  "La búsqueda en X todavía no está activada en LYRA (falta la credencial de X API del servidor). Mientras tanto puedo usar la búsqueda web.";

export function xAvailable(env: Env = process.env) {
  return xSettings(env).enabled && xConfig(env).configured;
}

export async function loadXUser(userId: string): Promise<XUserCtx | null> {
  return getPrisma().user.findUnique({ where: { id: userId }, select: { id: true, package: true, role: true } });
}

function cacheKey(path: string, params: Record<string, string>) {
  const sorted = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha256").update(`${path}?${sorted}`).digest("hex");
}

async function usedToday(userId: string | null, day: string) {
  const prisma = getPrisma();
  const where = { day, status: "ok", ...(userId ? { userId } : {}) };
  const [posts, counts] = await Promise.all([
    prisma.vegaXCall.aggregate({ where, _sum: { posts: true } }),
    prisma.vegaXCall.count({ where: { ...where, kind: "counts" } }),
  ]);
  return (posts._sum.posts ?? 0) + counts;
}

function failure(error: unknown): XFailure {
  if (error instanceof XRateLimitError) return { ok: false, code: "rate_limit", error: error.message };
  if (error instanceof XAuthError) return { ok: false, code: "auth", error: "X rechazó la consulta (credencial o saldo de X API). Avísale al administrador de LYRA." };
  if (error instanceof XRequestError) return { ok: false, code: "request", error: error.message };
  return { ok: false, code: "error", error: "No pude consultar X en este momento. Intenta más tarde." };
}

/**
 * Una solicitud a X API. `estimate` = posts que podría devolver (para no pasarse del tope antes de pedir).
 * Con `cache`, la respuesta (datos públicos) se comparte entre socios durante VEGA_X_CACHE_MINUTES.
 */
async function xRequest(
  user: XUserCtx,
  input: { kind: XKind; path: string; params: Record<string, string>; estimate: number; cache: boolean },
  deps: XServiceDeps,
): Promise<XOk<unknown> | XFailure> {
  const settings = xSettings(deps.env);
  const config = xConfig(deps.env);
  if (!settings.enabled) return { ok: false, code: "off", error: "La búsqueda en X está apagada en LYRA por ahora." };
  if (!config.configured) return { ok: false, code: "not_configured", error: X_NOT_CONFIGURED_MESSAGE };
  const cap = dailyPostCap(user, deps.env);
  if (cap === null) return { ok: false, code: "no_plan", error: "La inteligencia de X está incluida en los planes Inicio, Negocio y Pro." };

  const prisma = getPrisma();
  const now = deps.now();
  const key = cacheKey(input.path, input.params);
  if (input.cache && settings.cacheMinutes > 0) {
    const hit = await prisma.vegaXCache.findUnique({ where: { key } }).catch(() => null);
    if (hit && hit.expiresAt.getTime() > now.getTime()) return { ok: true, data: hit.payload, cached: true, remainingPosts: null };
  }

  const day = xDay(now);
  const used = await usedToday(user.id, day);
  const remaining = cap - used;
  if (remaining < Math.min(input.estimate, 10)) {
    return {
      ok: false,
      code: "daily_cap",
      error: `Llegaste al límite diario de consultas a X de tu plan (${cap} posts al día). Se renueva a medianoche (hora de Ciudad de México); con un plan más alto el límite es mayor.`,
    };
  }
  if (settings.globalDailyPosts > 0 && (await usedToday(null, day)) + input.estimate > settings.globalDailyPosts) {
    return { ok: false, code: "global_cap", error: "LYRA llegó a su límite diario de consultas a X. Intenta de nuevo mañana." };
  }
  if (settings.countInCostCap) {
    const status = await costStatus({ id: user.id, package: user.package, role: user.role ?? undefined }, now, deps.env).catch(() => null);
    if (status?.level === "capped") return { ok: false, code: "cost_cap", error: capReachedMessage(status) };
  }

  // Nunca pedir más posts de los que quedan en el tope del día (mínimo 10 de X).
  const params = { ...input.params };
  if (params.max_results) params.max_results = String(Math.max(10, Math.min(Number(params.max_results), remaining)));

  let body: unknown;
  try {
    const url = new URL(`${config.baseUrl}${input.path}`);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    const response = await deps.fetch(url, { headers: { authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(15_000) });
    if (response.status === 401 || response.status === 402 || response.status === 403) throw new XAuthError();
    if (response.status === 429) throw new XRateLimitError();
    if (!response.ok) throw new XRequestError(response.status);
    body = await response.json().catch(() => null);
  } catch (error) {
    const failed = failure(error);
    await prisma.vegaXCall
      .create({ data: { userId: user.id, kind: input.kind, query: (params.query ?? "").slice(0, 600), day, posts: 0, costUsd: 0, status: failed.code, createdAt: now } })
      .catch(() => null);
    console.warn("[Vega X] consulta fallida", { kind: input.kind, code: failed.code });
    return failed;
  }

  const isCounts = input.path.includes("/counts/");
  const posts = isCounts ? 0 : Array.isArray((body as { data?: unknown } | null)?.data) ? ((body as { data: unknown[] }).data.length) : 0;
  const users = isCounts ? 0 : ((body as { includes?: { users?: unknown[] } } | null)?.includes?.users?.length ?? 0);
  const costUsd = xCallCost({ posts, users, counts: isCounts ? 1 : 0 }, deps.env);
  await prisma.vegaXCall
    .create({ data: { userId: user.id, kind: isCounts ? "counts" : input.kind, query: (params.query ?? "").slice(0, 600), day, posts, users, costUsd, status: "ok", createdAt: now } })
    .catch((error: unknown) => console.error("[Vega X] no se pudo registrar la consulta", error instanceof Error ? error.message : typeof error));
  if (settings.countInCostCap && costUsd > 0) {
    // El gasto en X cuenta contra el tope mensual de la Fase 7.
    await prisma.vegaUsageLog
      .create({
        data: { userId: user.id, source: "x", month: costMonth(now), models: { x: input.kind }, calls: 1, costUsd, costSource: "x_api", createdAt: now },
      })
      .catch(() => null);
  }
  if (input.cache && settings.cacheMinutes > 0 && body) {
    const expiresAt = new Date(now.getTime() + settings.cacheMinutes * 60_000);
    await prisma.vegaXCache
      .upsert({
        where: { key },
        create: { key, kind: input.kind, payload: body as Prisma.InputJsonValue, expiresAt },
        update: { payload: body as Prisma.InputJsonValue, expiresAt },
      })
      .catch(() => null);
    // Limpieza ocasional de la caché vencida (sin cron extra).
    if (Math.random() < 0.05) {
      await prisma.vegaXCache.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 3_600_000) } } }).catch(() => null);
    }
  }
  return { ok: true, data: body, cached: false, remainingPosts: Math.max(0, remaining - posts - (isCounts ? 1 : 0)) };
}

const searchFields = {
  "tweet.fields": "created_at,entities,author_id,public_metrics,lang",
  expansions: "author_id",
  "user.fields": "username,name,public_metrics,description,verified",
};

export async function xSearch(
  user: XUserCtx,
  query: string,
  options: { kind: XKind; maxResults: number; sinceId?: string | null; startTime?: Date; cache?: boolean; withUsers?: boolean },
  deps: XServiceDeps = defaultDeps(),
): Promise<XOk<XSearchResult> | XFailure> {
  const maxResults = Math.min(100, Math.max(10, Math.round(options.maxResults)));
  // Los autores (includes.users) se cobran como User: Read; sin ellos la consulta cuesta la mitad o menos.
  const params: Record<string, string> =
    options.withUsers === false
      ? { query, max_results: String(maxResults), "tweet.fields": searchFields["tweet.fields"] }
      : { query, max_results: String(maxResults), ...searchFields };
  if (options.sinceId) params.since_id = options.sinceId;
  else if (options.startTime) params.start_time = options.startTime.toISOString().replace(/\.\d{3}Z$/, "Z");
  const result = await xRequest(user, { kind: options.kind, path: "/tweets/search/recent", params, estimate: maxResults, cache: options.cache ?? true }, deps);
  return result.ok ? { ...result, data: parseRecentSearch(result.data) } : result;
}

export async function xCounts(user: XUserCtx, query: string, deps: XServiceDeps = defaultDeps()): Promise<XOk<XCountBucket[]> | XFailure> {
  const result = await xRequest(user, { kind: "counts", path: "/tweets/counts/recent", params: { query, granularity: "hour" }, estimate: 1, cache: true }, deps);
  return result.ok ? { ...result, data: parseCounts(result.data) } : result;
}

/** Resumen de uso de X de hoy (para ver_monitores y el reporte). */
export async function xUsageToday(user: XUserCtx, now = new Date(), env: Env = process.env) {
  const cap = dailyPostCap(user, env);
  const used = await usedToday(user.id, xDay(now));
  return { cap, used, remaining: cap === null ? 0 : Math.max(0, cap - used) };
}
