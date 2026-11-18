// Vega v2 · trabajos en segundo plano (lógica pura, sin base de datos).
//
// Un trabajo es una lista corta de pasos. Cada llamada a `advanceJobOnce` reclama el
// trabajo con un candado temporal (lease), ejecuta UN paso dentro del presupuesto de
// la invocación (< 60 s en Vercel Hobby) y lo suelta. Lo retoman la tarjeta del chat
// (sondeo), `after()` al terminar el turno y el despachador. Dos invocaciones a la vez
// nunca corren el mismo paso: la segunda no obtiene el candado.

import type { FunctionDeclaration } from "@/lib/vega/gemini-stream";

/** Lo que guarda la tarjeta del chat (VegaAction.payload) sobre su trabajo. */
export type JobDraft = { job: { jobId: string; title: string; steps: string[] } };

export function jobDraftOf(payload: unknown): JobDraft["job"] | null {
  if (!payload || typeof payload !== "object") return null;
  const job = (payload as { job?: unknown }).job;
  if (!job || typeof job !== "object" || typeof (job as { jobId?: unknown }).jobId !== "string") return null;
  return job as JobDraft["job"];
}

export const backgroundJobTool = "trabajo_en_segundo_plano";

export type JobStepState = "pending" | "running" | "done" | "failed" | "skipped";
export type JobStep = { title: string; state: JobStepState; result?: string; actionIds?: string[] };
export type JobStatus = "queued" | "running" | "done" | "failed" | "canceled";

export const jobLimits = {
  maxSteps: 5,
  titleChars: 80,
  stepChars: 160,
  goalChars: 1500,
  resultChars: 4000,
  /** Candado de una invocación: un poco más que la duración máxima de la ruta. */
  leaseMs: 75_000,
  /** No se empieza un paso con menos tiempo que esto. */
  minStepMs: 20_000,
  /** Tope de tiempo de un paso (la ruta tiene maxDuration = 60). */
  stepBudgetMs: 50_000,
  /** Reintentos del mismo paso antes de dar el trabajo por fallido. */
  maxRetries: 1,
} as const;

export type JobRecord = {
  id: string;
  userId: string;
  conversationId: string;
  agentId: string | null;
  actionId: string | null;
  title: string;
  goal: string;
  status: JobStatus;
  steps: JobStep[];
  stepIndex: number;
  failures: number;
  cancelRequested: boolean;
  lockedUntil: Date | null;
  result: string | null;
  error: string | null;
  credits: number;
  costUsd: number;
};

export type JobView = {
  id: string;
  title: string;
  status: JobStatus;
  steps: { title: string; state: JobStepState; preview?: string }[];
  progress: number;
  cancelRequested: boolean;
  result: string | null;
  error: string | null;
  credits: number;
};

export type StepOutcome =
  | { ok: true; content: string; actionIds: string[]; credits: number; costUsd: number }
  | { ok: false; error: string; retry: boolean; credits?: number; costUsd?: number };

export type JobPatch = Partial<Omit<JobRecord, "id" | "userId" | "conversationId">> & { startedAt?: Date; finishedAt?: Date };

export type JobStore = {
  /** Toma el candado si el trabajo sigue activo y nadie más lo tiene. Devuelve el trabajo o null. */
  claim: (id: string, now: Date, leaseUntil: Date) => Promise<JobRecord | null>;
  load: (id: string) => Promise<JobRecord | null>;
  save: (id: string, patch: JobPatch) => Promise<void>;
};

export type JobDeps = {
  store: JobStore;
  /** Ejecuta el paso `index` (un turno de Vega sin el socio en línea). */
  runStep: (job: JobRecord, index: number, budgetMs: number) => Promise<StepOutcome>;
  /** Se llama una vez cuando el trabajo termina (listo, fallido o cancelado). */
  finish: (job: JobRecord) => Promise<void>;
  now?: () => number;
};

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Valida lo que Vega pidió con la herramienta `trabajo_en_segundo_plano`. */
export function planFromArgs(args: Record<string, unknown>): { ok: true; title: string; goal: string; steps: JobStep[] } | { ok: false; error: string } {
  const title = clean(args.titulo, jobLimits.titleChars);
  const goal = typeof args.objetivo === "string" ? args.objetivo.trim().slice(0, jobLimits.goalChars) : "";
  const raw = Array.isArray(args.pasos) ? args.pasos : [];
  const steps = raw
    .map((item) => clean(item, jobLimits.stepChars))
    .filter(Boolean)
    .slice(0, jobLimits.maxSteps)
    .map((stepTitle): JobStep => ({ title: stepTitle, state: "pending" }));
  if (!title || !goal) return { ok: false, error: "Falta el título o el objetivo del trabajo." };
  if (steps.length < 2) return { ok: false, error: "Un trabajo en segundo plano necesita al menos 2 pasos; si cabe en una respuesta, hazlo directo." };
  return { ok: true, title, goal, steps };
}

export function isActive(status: JobStatus) {
  return status === "queued" || status === "running";
}

export function jobProgress(job: Pick<JobRecord, "status" | "steps">) {
  if (job.status === "done") return 100;
  const total = Math.max(1, job.steps.length);
  const done = job.steps.filter((step) => step.state === "done").length;
  const running = job.steps.some((step) => step.state === "running") ? 0.5 : 0;
  return Math.max(4, Math.min(96, Math.round(((done + running) / total) * 100)));
}

export function jobView(job: JobRecord): JobView {
  return {
    id: job.id,
    title: job.title,
    status: job.status,
    steps: job.steps.map((step) => ({
      title: step.title,
      state: step.state,
      ...(step.result ? { preview: step.result.slice(0, 280) } : {}),
    })),
    progress: jobProgress(job),
    cancelRequested: job.cancelRequested,
    result: job.status === "done" ? job.result : null,
    error: job.error,
    credits: job.credits,
  };
}

/** Lo que recibe Vega en cada paso (el socio no está esperando la respuesta). */
export function stepMessage(job: Pick<JobRecord, "title" | "goal" | "steps">, index: number) {
  const total = job.steps.length;
  const last = index === total - 1;
  const previous = job.steps
    .slice(0, index)
    .filter((step) => step.state === "done" && step.result)
    .map((step, position) => `Paso ${position + 1} · ${step.title}:\n${step.result}`)
    .join("\n\n");
  return [
    `Trabajo en segundo plano «${job.title}» · paso ${index + 1} de ${total}: ${job.steps[index]?.title ?? ""}.`,
    `Objetivo general: ${job.goal}`,
    previous ? `Resultados de los pasos anteriores:\n${previous}` : "",
    last
      ? "Este es el último paso: entrega al socio el resultado final completo, claro y ordenado. No repitas el plan ni digas que vas a empezar."
      : "Haz solo este paso y responde únicamente con su resultado (máximo 15 líneas). No saludes, no hagas preguntas y no anuncies los pasos siguientes.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function jobChannelNote(title: string) {
  return [
    `Canal: trabajo en segundo plano «${title}» que el socio te pidió en el chat.`,
    "El socio no está esperando esta respuesta: no le hagas preguntas; trabaja con lo que tienes y declara tus supuestos.",
    "Cualquier envío (correo, mensaje, publicación) queda como tarjeta pendiente que el socio confirmará; nunca digas que ya se envió.",
  ].join(" ");
}

function skipRest(steps: JobStep[], from: number) {
  return steps.map((step, index) => (index >= from && (step.state === "pending" || step.state === "running") ? { ...step, state: "skipped" as const } : step));
}

async function close(deps: JobDeps, job: JobRecord, patch: JobPatch, now: Date) {
  const final: JobRecord = { ...job, ...patch, lockedUntil: null };
  await deps.store.save(job.id, { ...patch, lockedUntil: null, finishedAt: now });
  await deps.finish(final);
  return final;
}

/**
 * Avanza el trabajo un paso. Devuelve el estado después del intento, o el estado actual
 * sin cambios si otra invocación tiene el candado, ya terminó o no alcanza el tiempo.
 */
export async function advanceJobOnce(id: string, deps: JobDeps, budgetMs: number = jobLimits.stepBudgetMs): Promise<{ job: JobRecord | null; advanced: boolean }> {
  const clock = deps.now ?? Date.now;
  const startedAt = clock();
  if (budgetMs < jobLimits.minStepMs) return { job: await deps.store.load(id), advanced: false };
  const now = new Date(startedAt);
  const job = await deps.store.claim(id, now, new Date(startedAt + jobLimits.leaseMs));
  if (!job) return { job: await deps.store.load(id), advanced: false };

  if (job.cancelRequested) {
    return { job: await close(deps, job, { status: "canceled", steps: skipRest(job.steps, job.stepIndex), error: null }, now), advanced: true };
  }
  const index = job.stepIndex;
  if (index >= job.steps.length) {
    return { job: await close(deps, job, { status: "done" }, now), advanced: true };
  }

  const running = job.steps.map((step, position) => (position === index ? { ...step, state: "running" as const } : step));
  await deps.store.save(id, { status: "running", steps: running, ...(index === 0 && job.status === "queued" ? { startedAt: now } : {}) });
  const current: JobRecord = { ...job, status: "running", steps: running };

  const stepBudget = Math.min(jobLimits.stepBudgetMs, budgetMs - (clock() - startedAt));
  const outcome = await deps.runStep(current, index, stepBudget).catch(
    (error: unknown): StepOutcome => ({ ok: false, retry: true, error: error instanceof Error ? error.message.slice(0, 200) : "El paso falló." }),
  );
  const after = await deps.store.load(id);
  const cancel = Boolean(after?.cancelRequested);
  const credits = current.credits + (outcome.credits ?? 0);
  const costUsd = current.costUsd + (outcome.costUsd ?? 0);
  const finishedAt = new Date(clock());

  if (outcome.ok) {
    const steps = running.map((step, position) =>
      position === index
        ? { ...step, state: "done" as const, result: outcome.content.slice(0, jobLimits.resultChars), ...(outcome.actionIds.length ? { actionIds: outcome.actionIds } : {}) }
        : step,
    );
    const last = index === steps.length - 1;
    if (last) return { job: await close(deps, current, { status: "done", steps, stepIndex: index + 1, failures: 0, result: outcome.content, credits, costUsd }, finishedAt), advanced: true };
    if (cancel) return { job: await close(deps, current, { status: "canceled", steps: skipRest(steps, index + 1), stepIndex: index + 1, credits, costUsd }, finishedAt), advanced: true };
    const patch: JobPatch = { steps, stepIndex: index + 1, failures: 0, credits, costUsd, lockedUntil: null };
    await deps.store.save(id, patch);
    return { job: { ...current, ...patch, lockedUntil: null }, advanced: true };
  }

  const failures = current.failures + 1;
  if (cancel) {
    return { job: await close(deps, current, { status: "canceled", steps: skipRest(running, index), credits, costUsd }, finishedAt), advanced: true };
  }
  if (!outcome.retry || failures > jobLimits.maxRetries) {
    const steps = skipRest(
      running.map((step, position) => (position === index ? { ...step, state: "failed" as const } : step)),
      index + 1,
    );
    return { job: await close(deps, current, { status: "failed", steps, failures, error: outcome.error, credits, costUsd }, finishedAt), advanced: true };
  }
  const steps = running.map((step, position) => (position === index ? { ...step, state: "pending" as const } : step));
  const patch: JobPatch = { steps, failures, credits, costUsd, lockedUntil: null };
  await deps.store.save(id, patch);
  return { job: { ...current, ...patch, lockedUntil: null }, advanced: true };
}

/** Avanza pasos mientras quede tiempo en esta invocación. */
export async function runJob(id: string, deps: JobDeps, budgetMs: number) {
  const clock = deps.now ?? Date.now;
  const deadline = clock() + budgetMs;
  let last: JobRecord | null = null;
  for (let guard = 0; guard < jobLimits.maxSteps + jobLimits.maxRetries + 2; guard += 1) {
    const left = deadline - clock();
    const { job, advanced } = await advanceJobOnce(id, deps, left);
    last = job;
    if (!advanced || !job || !isActive(job.status)) break;
  }
  return last;
}

export const backgroundJobDeclaration: FunctionDeclaration = {
  name: backgroundJobTool,
  description: `Deja un trabajo largo en segundo plano cuando el pedido necesita varios pasos que no caben en una respuesta rápida (investigar y comparar varias fuentes, preparar un documento o plan extenso, revisar muchos correos). Define de 2 a ${jobLimits.maxSteps} pasos concretos; cada paso se hace aparte y el socio ve el avance en una tarjeta, puede seguir platicando y cancelarlo. Cada paso cuesta como un mensaje de Vega. Después de llamarla responde en UNA frase: qué vas a hacer y que le avisas aquí al terminar. No la uses para preguntas simples ni para lo que puedes responder ya.`,
  parameters: {
    type: "object",
    properties: {
      titulo: { type: "string", description: "Nombre corto del trabajo (máx. 80 caracteres)." },
      objetivo: { type: "string", description: "Qué quiere el socio y cómo debe verse el resultado final." },
      pasos: { type: "array", items: { type: "string" }, description: `De 2 a ${jobLimits.maxSteps} pasos en orden; el último entrega el resultado final.` },
    },
    required: ["titulo", "objetivo", "pasos"],
  },
};
