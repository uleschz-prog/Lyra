import { after, NextResponse } from "next/server";

import { checkCronAuth, cronAuthError, cronErrorMessage } from "@/lib/cron/auth";

import { dispatchRoutines } from "@/lib/vega/routine-runner";

/** Tiempo de la invocación que usa el despachador (la ruta tiene maxDuration = 60). */
export const DISPATCH_BUDGET_MS = 55_000;

async function resumeIdleBuilds(budgetMs: number) {
  const [{ resumeBuilds }, { getPrisma }] = await Promise.all([import("@/lib/builder/runner"), import("@/lib/prisma")]);
  return resumeBuilds({ db: getPrisma() }, { budgetMs });
}

/** PR H: libera ganancias del Marketplace que ya cumplieron los 7 días (solo en el cron diario). */
async function releaseMarketplaceEarnings() {
  const [{ releaseDueEarnings }, { ledgerCredits, marketDb }] = await Promise.all([import("@/lib/marketplace/core"), import("@/lib/marketplace/server")]);
  return releaseDueEarnings(marketDb(), ledgerCredits, { take: 200 });
}

/** `true` si el request trae `Authorization: Bearer $CRON_SECRET` (comparación en tiempo constante). */
export function authorizedCron(request: Request, secret = process.env.CRON_SECRET) {
  return checkCronAuth(request, secret).ok;
}

/** Resumen corto para logs: solo contadores y mensajes de error, nunca contenido de rutinas. */
function logSummary(result: Record<string, unknown>) {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "number") parts.push(`${key}=${value}`);
    else if (value && typeof value === "object") {
      const inner = value as Record<string, unknown>;
      if (typeof inner.error === "string") parts.push(`${key}.error=${JSON.stringify(inner.error.slice(0, 200))}`);
      else {
        const counts = Object.entries(inner).filter(([, v]) => typeof v === "number").map(([k, v]) => `${k}:${v}`);
        if (counts.length) parts.push(`${key}={${counts.join(",")}}`);
      }
    } else if (key === "error" && typeof value === "string") parts.push(`error=${JSON.stringify(value.slice(0, 200))}`);
  }
  return parts.join(" ");
}

/**
 * Despacha rutinas vencidas. Lo llaman el cron diario de Vercel y cualquier pinger externo
 * (cron-job.org, GitHub Actions, Render) con `Authorization: Bearer $CRON_SECRET`.
 * Por defecto responde 202 de inmediato y trabaja en segundo plano con `after()`;
 * con `?wait=1` espera y devuelve el resumen.
 */
export async function handleDispatch(request: Request, options: { horizonMs?: number; releaseEarnings?: boolean; label?: string } = {}) {
  const started = Date.now();
  const label = options.label ?? "vega-routines";
  const denied = cronAuthError(request, label);
  if (denied) return denied;
  const wait = new URL(request.url).searchParams.get("wait") === "1";
  console.info(`[cron:${label}] inicio (${request.method}${wait ? ", wait=1" : ""})`);
  const run = async () => {
    const dispatched = await dispatchRoutines({ budgetMs: DISPATCH_BUDGET_MS - (Date.now() - started), horizonMs: options.horizonMs });
    const routines = options.releaseEarnings
      ? {
          ...dispatched,
          marketplace: await releaseMarketplaceEarnings().catch((error: unknown) => ({ error: error instanceof Error ? error.message : "earnings failed" })),
          // Cuota de datos en vivo: no hace nada mientras LIVE_APP_MONTHLY_FEE sea 0.
          liveApps: await import("@/lib/liveapps/billing")
            .then(({ chargeLiveAppFees }) => chargeLiveAppFees())
            .catch((error: unknown) => ({ error: error instanceof Error ? error.message : "live fees failed" })),
        }
      : dispatched;
    // PR C: con el tiempo que sobre, retoma construcciones del generador v2 que nadie está sondeando.
    const left = DISPATCH_BUDGET_MS - (Date.now() - started);
    if (left < 20_000) return routines;
    const builds = await resumeIdleBuilds(left - 5_000).catch((error: unknown) => ({ error: error instanceof Error ? error.message : "builds failed" }));
    // Vega v2: con lo que sobre, retoma trabajos en segundo plano que nadie está avanzando.
    const rest = DISPATCH_BUDGET_MS - (Date.now() - started);
    if (rest < 25_000) return { ...routines, builds };
    const { resumeJobs } = await import("@/lib/vega/jobs");
    const jobs = await resumeJobs({ budgetMs: rest - 5_000 }).catch((error: unknown) => ({ error: error instanceof Error ? error.message : "jobs failed" }));
    return { ...routines, builds, jobs };
  };
  const runLogged = async () => {
    try {
      const result = (await run()) as Record<string, unknown>;
      console.info(`[cron:${label}] fin en ${Date.now() - started} ms · ${logSummary(result)}`);
      return { ok: true as const, result };
    } catch (error) {
      console.error(`[cron:${label}] error tras ${Date.now() - started} ms: ${cronErrorMessage(error)}`);
      return { ok: false as const, error: "El despachador falló; revisa los logs." };
    }
  };
  if (wait) {
    const outcome = await runLogged();
    return outcome.ok ? NextResponse.json(outcome.result) : NextResponse.json({ error: outcome.error }, { status: 500 });
  }
  after(async () => {
    await runLogged();
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
