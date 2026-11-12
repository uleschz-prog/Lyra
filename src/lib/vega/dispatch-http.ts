import { timingSafeEqual } from "node:crypto";

import { after, NextResponse } from "next/server";

import { dispatchRoutines } from "@/lib/vega/routine-runner";

/** Tiempo de la invocación que usa el despachador (la ruta tiene maxDuration = 60). */
export const DISPATCH_BUDGET_MS = 55_000;

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
export async function handleDispatch(request: Request, options: { horizonMs?: number } = {}) {
  const started = Date.now();
  if (!authorizedCron(request)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const run = () => dispatchRoutines({ budgetMs: DISPATCH_BUDGET_MS - (Date.now() - started), horizonMs: options.horizonMs });
  if (new URL(request.url).searchParams.get("wait") === "1") {
    return NextResponse.json(await run());
  }
  after(async () => {
    const result = await run().catch((error: unknown) => ({ error: error instanceof Error ? error.message : "dispatch failed" }));
    console.info("[vega-routines] dispatch", JSON.stringify(result));
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
