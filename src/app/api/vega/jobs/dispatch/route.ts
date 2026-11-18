import { after, NextResponse } from "next/server";

import { authorizedCron } from "@/lib/vega/dispatch-http";
import { defaultJobDeps, kickJobDispatch, resumeJobs } from "@/lib/vega/jobs";
import { isActive, runJob } from "@/lib/vega/jobs-core";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BUDGET_MS = 55_000;

/**
 * Avanza trabajos en segundo plano. Con `?job=<id>` sigue uno (lo encadena el propio
 * servidor cuando el socio cerró el chat); sin él, retoma los que nadie está avanzando.
 * Requiere `Authorization: Bearer $CRON_SECRET`. Responde 202 y trabaja con `after()`.
 */
export async function POST(request: Request) {
  const started = Date.now();
  if (!authorizedCron(request)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const url = new URL(request.url);
  const jobId = url.searchParams.get("job");
  after(async () => {
    const budgetMs = BUDGET_MS - (Date.now() - started);
    if (jobId && /^[a-z0-9]{10,40}$/i.test(jobId)) {
      const job = await runJob(jobId, defaultJobDeps(), budgetMs).catch(() => null);
      // Encadena solo si este turno avanzó algo y aún faltan pasos (máximo 5 pasos por trabajo).
      if (job && isActive(job.status) && !job.lockedUntil) await kickJobDispatch(url.origin, jobId);
      return;
    }
    const result = await resumeJobs({ budgetMs }).catch((error: unknown) => ({ error: error instanceof Error ? error.message : "jobs failed" }));
    console.info("[vega-jobs] dispatch", JSON.stringify(result));
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}

export const GET = POST;
