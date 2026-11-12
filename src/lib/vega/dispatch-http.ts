import { timingSafeEqual } from "node:crypto";

import { after, NextResponse } from "next/server";

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

export function authorizedCron(request: Request, secret = process.env.CRON_SECRET) {
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Despacha rutinas vencidas. Lo llaman el cron diario de Vercel y cualquier pinger externo
 * (cron-job.org, GitHub Actions, Render) con `Authorization: Bearer $CRON_SECRET`.
 * Por defecto responde 202 de inmediato y trabaja en segundo plano con `after()`;
 * con `?wait=1` espera y devuelve el resumen.
 */
export async function handleDispatch(request: Request, options: { horizonMs?: number; releaseEarnings?: boolean } = {}) {
  const started = Date.now();
  if (!authorizedCron(request)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const run = async () => {
    const dispatched = await dispatchRoutines({ budgetMs: DISPATCH_BUDGET_MS - (Date.now() - started), horizonMs: options.horizonMs });
    const routines = options.releaseEarnings
      ? { ...dispatched, marketplace: await releaseMarketplaceEarnings().catch((error: unknown) => ({ error: error instanceof Error ? error.message : "earnings failed" })) }
      : dispatched;
    // PR C: con el tiempo que sobre, retoma construcciones del generador v2 que nadie está sondeando.
    const left = DISPATCH_BUDGET_MS - (Date.now() - started);
    if (left < 20_000) return routines;
    const builds = await resumeIdleBuilds(left - 5_000).catch((error: unknown) => ({ error: error instanceof Error ? error.message : "builds failed" }));
    return { ...routines, builds };
  };
  if (new URL(request.url).searchParams.get("wait") === "1") {
    return NextResponse.json(await run());
  }
  after(async () => {
    const result = await run().catch((error: unknown) => ({ error: error instanceof Error ? error.message : "dispatch failed" }));
    console.info("[vega-routines] dispatch", JSON.stringify(result));
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
