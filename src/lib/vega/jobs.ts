// Vega v2 · trabajos en segundo plano (servidor): base de datos, turnos y avisos en el chat.
import type { Prisma } from "@/generated/prisma/client";
import { creditPrices } from "@/lib/credits/prices";
import { getPrisma } from "@/lib/prisma";
import { canUseVega } from "@/lib/vega/access";
import { ensureDefaultVegaAgent } from "@/lib/vega/agents";
import { backgroundJobTool, delegateTool } from "@/lib/vega/jobs-tool";
import {
  advanceJobOnce,
  isActive,
  jobChannelNote,
  jobLimits,
  jobView,
  runJob,
  stepMessage,
  type JobDeps,
  type JobRecord,
  type JobStatus,
  type JobStep,
  type JobStore,
  type StepOutcome,
} from "@/lib/vega/jobs-core";
import { prepareVegaTurn, runVegaTurn } from "@/lib/vega/turn";

type Db = ReturnType<typeof getPrisma>;

const recordSelect = {
  id: true,
  userId: true,
  conversationId: true,
  agentId: true,
  actionId: true,
  title: true,
  goal: true,
  status: true,
  steps: true,
  stepIndex: true,
  failures: true,
  cancelRequested: true,
  lockedUntil: true,
  result: true,
  error: true,
  credits: true,
  costUsd: true,
} as const;

function toRecord(row: { steps: unknown; status: string } & Omit<JobRecord, "steps" | "status">): JobRecord {
  return { ...row, status: row.status as JobStatus, steps: Array.isArray(row.steps) ? (row.steps as JobStep[]) : [] };
}

export function prismaJobStore(db: Db): JobStore {
  return {
    async claim(id, now, leaseUntil) {
      const taken = await db.vegaJob.updateMany({
        where: { id, status: { in: ["queued", "running"] }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
        data: { lockedUntil: leaseUntil },
      });
      if (taken.count !== 1) return null;
      const row = await db.vegaJob.findUnique({ where: { id }, select: recordSelect });
      return row ? toRecord(row) : null;
    },
    async load(id) {
      const row = await db.vegaJob.findUnique({ where: { id }, select: recordSelect });
      return row ? toRecord(row) : null;
    },
    async save(id, patch) {
      const { steps, ...rest } = patch;
      await db.vegaJob.update({
        where: { id },
        data: { ...rest, ...(steps ? { steps: steps as unknown as Prisma.InputJsonValue } : {}) },
        select: { id: true },
      });
    },
  };
}

/** Un paso = un turno de Vega sin el socio en línea, en la misma conversación. */
async function runStepTurn(db: Db, job: JobRecord, index: number, budgetMs: number): Promise<StepOutcome> {
  const user = await db.user.findUnique({ where: { id: job.userId }, select: { id: true, name: true, package: true, role: true, suspendedUntil: true } });
  if (!user || !canUseVega(user as never) || (user.suspendedUntil && user.suspendedUntil > new Date())) {
    return { ok: false, retry: false, error: "Tu cuenta ya no tiene acceso a Vega." };
  }
  const agentId = job.agentId ?? (await ensureDefaultVegaAgent(user.id)).id;
  const last = index === job.steps.length - 1;
  const prepared = await prepareVegaTurn(user, {
    source: "job",
    agentId,
    conversationId: job.conversationId,
    message: stepMessage(job, index),
    requestId: `job-${job.id}-${index}-${job.failures}`,
    channelNote: jobChannelNote(job.title),
    ephemeral: true,
    excludeTools: [backgroundJobTool, delegateTool],
    timeBudgetMs: Math.max(10_000, budgetMs - 5_000),
  });
  if (!prepared.ok) {
    // Sin créditos, tope de costo o agente borrado: no tiene caso reintentar.
    const retry = prepared.status >= 500;
    return { ok: false, retry, error: prepared.error };
  }
  prepared.turn.userMessage = "";
  prepared.turn.persistReply = last;
  prepared.turn.jobId = job.id;
  if (last) prepared.turn.extraActionIds = job.steps.flatMap((step) => step.actionIds ?? []);
  const result = await runVegaTurn(prepared.turn, () => undefined);
  const credits = result.content ? creditPrices.vegaMessage + (result.toolCharged ? creditPrices.vegaTool - creditPrices.vegaMessage : 0) : 0;
  const costUsd = result.usage?.costUsd ?? 0;
  if (!result.content) return { ok: false, retry: true, error: "Vega no alcanzó a terminar este paso.", credits, costUsd };
  return { ok: true, content: result.content, actionIds: result.actionIds, credits, costUsd };
}

/** Al terminar: actualiza la tarjeta y, si falló o se canceló, lo dice en el chat. */
async function finishJob(db: Db, job: JobRecord) {
  const done = job.steps.filter((step) => step.state === "done").length;
  const summary =
    job.status === "done"
      ? `Terminado: ${job.title}.`
      : job.status === "canceled"
        ? `Cancelado: ${job.title} (${done} de ${job.steps.length} pasos hechos).`
        : `No se pudo terminar: ${job.title}. ${job.error ?? ""}`.trim();
  if (job.actionId) {
    await db.vegaAction.updateMany({
      where: { id: job.actionId },
      data: { status: job.status === "done" ? "done" : job.status === "canceled" ? "cancelled" : "failed", result: summary },
    });
  }
  if (job.status !== "done") {
    await db.vegaMessage.create({
      data: {
        conversationId: job.conversationId,
        role: "assistant",
        content:
          job.status === "canceled"
            ? `Detuve «${job.title}» como pediste. Quedaron ${done} de ${job.steps.length} pasos hechos; no se cobra nada más.`
            : `No pude terminar «${job.title}». ${job.error ?? ""} Los pasos que no se completaron no se cobraron; puedes pedírmelo de nuevo.`.replace(/\s+/g, " ").trim(),
        meta: { job: job.id },
      },
    });
  }
  await db.vegaConversation.updateMany({ where: { id: job.conversationId }, data: { updatedAt: new Date() } });
  await reportToOrigin(db, job, done);
}

/** Vega v2 · V3: si otro agente hizo el trabajo, su resultado también llega a la conversación de origen. */
async function reportToOrigin(db: Db, job: JobRecord, done: number) {
  if (!job.actionId) return;
  const action = await db.vegaAction.findUnique({ where: { id: job.actionId }, select: { conversationId: true } });
  const origin = action?.conversationId;
  if (!origin || origin === job.conversationId) return;
  const agent = job.agentId ? await db.vegaAgent.findUnique({ where: { id: job.agentId }, select: { name: true } }) : null;
  const name = agent?.name ?? "El otro agente";
  const content =
    job.status === "done"
      ? `${name} terminó «${job.title}»:\n\n${job.result ?? ""}`.trim()
      : job.status === "canceled"
        ? `Se canceló «${job.title}», que estaba haciendo ${name} (${done} de ${job.steps.length} pasos hechos).`
        : `${name} no pudo terminar «${job.title}». ${job.error ?? ""}`.replace(/\s+/g, " ").trim();
  await db.vegaMessage.create({ data: { conversationId: origin, role: "assistant", content, meta: { job: job.id } } });
  await db.vegaConversation.updateMany({ where: { id: origin }, data: { updatedAt: new Date() } });
}

export function defaultJobDeps(db: Db = getPrisma()): JobDeps {
  return {
    store: prismaJobStore(db),
    runStep: (job, index, budgetMs) => runStepTurn(db, job, index, budgetMs),
    finish: (job) => finishJob(db, job),
  };
}

async function owned(db: Db, userId: string, id: string) {
  return db.vegaJob.findFirst({ where: { id, userId }, select: { id: true } });
}

export async function getJobForUser(userId: string, id: string) {
  const db = getPrisma();
  if (!(await owned(db, userId, id))) return null;
  const job = await prismaJobStore(db).load(id);
  return job ? jobView(job) : null;
}

/** La tarjeta del chat avanza el trabajo un paso por llamada. */
export async function advanceJobForUser(userId: string, id: string, budgetMs: number = jobLimits.stepBudgetMs) {
  const db = getPrisma();
  if (!(await owned(db, userId, id))) return null;
  const { job, advanced } = await advanceJobOnce(id, defaultJobDeps(db), budgetMs);
  return job ? { job: jobView(job), advanced } : null;
}

/** Cancela: si nadie lo está trabajando se cierra ya; si no, al terminar el paso en curso. */
export async function cancelJobForUser(userId: string, id: string) {
  const db = getPrisma();
  const updated = await db.vegaJob.updateMany({ where: { id, userId, status: { in: ["queued", "running"] } }, data: { cancelRequested: true } });
  if (updated.count === 0) return getJobForUser(userId, id);
  const { job } = await advanceJobOnce(id, defaultJobDeps(db), jobLimits.stepBudgetMs);
  return job ? jobView(job) : null;
}

/** Despachador: retoma trabajos activos que nadie está avanzando. */
export async function resumeJobs(options: { budgetMs: number; limit?: number; db?: Db }) {
  const db = options.db ?? getPrisma();
  const started = Date.now();
  const now = new Date();
  const rows = await db.vegaJob.findMany({
    where: { status: { in: ["queued", "running"] }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    orderBy: { updatedAt: "asc" },
    take: options.limit ?? 5,
    select: { id: true },
  });
  const deps = defaultJobDeps(db);
  const touched: { id: string; status: string }[] = [];
  for (const row of rows) {
    const left = options.budgetMs - (Date.now() - started);
    if (left < jobLimits.minStepMs) break;
    const job = await runJob(row.id, deps, left);
    touched.push({ id: row.id, status: job?.status ?? "missing" });
  }
  return { jobs: touched };
}

/** Pide al despachador de trabajos que siga en otra invocación (encadena pasos sin el socio en línea). */
export async function kickJobDispatch(origin: string, jobId: string, secret = process.env.CRON_SECRET) {
  if (!secret || !origin) return false;
  const response = await fetch(`${origin}/api/vega/jobs/dispatch?job=${encodeURIComponent(jobId)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(8_000),
  }).catch(() => null);
  return Boolean(response && response.status === 202);
}

/** Después del turno (con `after()`): avanza lo que alcance y, si falta, encadena otra invocación. */
export async function continueJobs(ids: string[], options: { budgetMs: number; origin: string }) {
  const deps = defaultJobDeps();
  const started = Date.now();
  for (const id of ids) {
    const left = options.budgetMs - (Date.now() - started);
    const job = left >= jobLimits.minStepMs ? await runJob(id, deps, left) : await deps.store.load(id);
    if (job && isActive(job.status)) await kickJobDispatch(options.origin, id);
  }
}
