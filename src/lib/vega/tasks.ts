// Rutinas de Vega (Fase 6): recordatorios a hora exacta y horarios recurrentes
// tipo cron en la zona horaria del socio. La ejecución vive en routine-runner.ts.
import { getPrisma } from "@/lib/prisma";
import { buildSchedule, DEFAULT_TIMEZONE, describeSchedule, nextRoutineRun } from "@/lib/vega/schedule";
import { DEFAULT_TIME, type TaskKind, type TaskRepeat, type VegaRoutineRunView, type VegaTaskView } from "@/lib/vega/tasks-shared";

export { DEFAULT_TIME, repeatLabels, type TaskKind, type TaskRepeat, type VegaTaskView } from "@/lib/vega/tasks-shared";

function readInt(raw: string | undefined, fallback: number, min: number, max: number) {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** Máximo de rutinas activas o en pausa por socio. */
export function maxRoutines(env: Record<string, string | undefined> = process.env) {
  return readInt(env.VEGA_MAX_ROUTINES, 20, 1, 100);
}

/** Máximo de ejecuciones en segundo plano por socio en una hora (las demás se omiten). */
export function routineRunsPerHour(env: Record<string, string | undefined> = process.env) {
  return readInt(env.VEGA_ROUTINE_RUNS_PER_HOUR, 8, 1, 60);
}

/** Turnos de rutina que el despachador corre en paralelo en una invocación (1-5). */
export function routineConcurrency(env: Record<string, string | undefined> = process.env) {
  return readInt(env.VEGA_ROUTINE_CONCURRENCY, 3, 1, 5);
}

/** @deprecated usa maxRoutines(); se conserva por compatibilidad. */
export const TASK_LIMIT = 20;

type TaskRow = {
  id: string;
  title: string;
  instruction: string;
  kind: string;
  repeat: string;
  useWeb: boolean;
  runAt: Date;
  status: string;
  lastRunAt: Date | null;
  lastResult: string | null;
  schedule: string | null;
  timezone: string;
  runCount: number;
  failCount: number;
};

export const taskSelect = {
  id: true,
  title: true,
  instruction: true,
  kind: true,
  repeat: true,
  useWeb: true,
  runAt: true,
  status: true,
  lastRunAt: true,
  lastResult: true,
  schedule: true,
  timezone: true,
  runCount: true,
  failCount: true,
} as const;

export function taskView(task: TaskRow): VegaTaskView {
  const timezone = task.timezone || DEFAULT_TIMEZONE;
  return {
    ...task,
    timezone,
    kind: task.kind as TaskKind,
    repeat: task.repeat as TaskRepeat,
    status: task.status as VegaTaskView["status"],
    runAt: task.runAt.toISOString(),
    lastRunAt: task.lastRunAt?.toISOString() ?? null,
    label: describeSchedule({ ...task, timezone }),
    runCount: task.runCount ?? 0,
    failCount: task.failCount ?? 0,
  };
}

export async function listTasks(userId: string, includeDone = false) {
  const rows = (await getPrisma().vegaTask.findMany({
    where: { userId, ...(includeDone ? {} : { status: { in: ["active", "paused"] } }) },
    orderBy: [{ status: "asc" }, { runAt: "asc" }],
    take: 50,
    select: taskSelect,
  })) as TaskRow[];
  return rows.map(taskView);
}

export type CreateRoutineInput = {
  title: string;
  instruction: string;
  kind: TaskKind;
  repeat: TaskRepeat;
  useWeb: boolean;
  /** YYYY-MM-DD local: el día de la primera ejecución (o del aviso único). */
  date: string;
  /** HH:MM local, 24 h. */
  time?: string;
  timezone?: string;
  /** Solo con repeat = "custom": cron de 5 campos. */
  cron?: string;
};

export async function createTask(userId: string, input: CreateRoutineInput, now = new Date()) {
  const prisma = getPrisma();
  const limit = maxRoutines();
  const active = await prisma.vegaTask.count({ where: { userId, status: { in: ["active", "paused"] } } });
  if (active >= limit) {
    return { ok: false as const, error: `Ya tienes ${limit} rutinas. Borra o termina alguna para agregar otra.` };
  }
  const built = buildSchedule(
    {
      repeat: input.repeat,
      date: input.date,
      time: input.time || DEFAULT_TIME,
      timezone: input.timezone || DEFAULT_TIMEZONE,
      cron: input.cron,
    },
    now,
  );
  if (!built.ok) return { ok: false as const, error: built.error };
  const task = (await prisma.vegaTask.create({
    data: {
      userId,
      title: input.title.slice(0, 120),
      instruction: input.instruction.slice(0, 1000),
      kind: input.kind,
      repeat: input.repeat,
      useWeb: input.kind === "task" && input.useWeb,
      runAt: built.runAt,
      schedule: built.schedule,
      timezone: built.timezone,
    },
    select: taskSelect,
  })) as TaskRow;
  return { ok: true as const, task: taskView(task) };
}

export async function pauseTask(userId: string, id: string) {
  const updated = await getPrisma().vegaTask.updateMany({ where: { id, userId, status: "active" }, data: { status: "paused" } });
  return updated.count > 0
    ? { ok: true as const }
    : { ok: false as const, error: "No encontré esa rutina activa." };
}

/** Reanuda una rutina en pausa. Las recurrentes saltan lo que se perdió y siguen en la próxima hora. */
export async function resumeTask(userId: string, id: string, now = new Date()) {
  const prisma = getPrisma();
  const task = (await prisma.vegaTask.findFirst({ where: { id, userId }, select: taskSelect })) as TaskRow | null;
  if (!task || task.status !== "paused") return { ok: false as const, error: "No encontré esa rutina en pausa." };
  let runAt = task.runAt;
  if (runAt.getTime() <= now.getTime()) {
    const next = nextRoutineRun(task, now);
    if (!next) return { ok: false as const, error: "Ese recordatorio ya pasó. Pídeme uno nuevo con otra fecha." };
    runAt = next;
  }
  const updated = await prisma.vegaTask.updateMany({ where: { id, userId, status: "paused" }, data: { status: "active", runAt } });
  if (updated.count === 0) return { ok: false as const, error: "No encontré esa rutina en pausa." };
  return { ok: true as const, runAt };
}

/** Compatibilidad con el panel anterior. */
export async function setTaskStatus(userId: string, id: string, status: "active" | "paused") {
  const result = status === "paused" ? await pauseTask(userId, id) : await resumeTask(userId, id);
  return result.ok;
}

export async function deleteTask(userId: string, id: string) {
  const deleted = await getPrisma().vegaTask.deleteMany({ where: { id, userId } });
  return deleted.count > 0;
}

function pendingCount(actionIds: unknown, pending: Set<string>) {
  return Array.isArray(actionIds) ? actionIds.filter((id) => typeof id === "string" && pending.has(id)).length : 0;
}

/** Últimas ejecuciones de rutinas del socio (resultados y avisos). */
export async function listRoutineRuns(userId: string, take = 20): Promise<VegaRoutineRunView[]> {
  const prisma = getPrisma();
  const runs = await prisma.vegaRoutineRun.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      taskId: true,
      scheduledFor: true,
      status: true,
      result: true,
      actionIds: true,
      conversationId: true,
      seenAt: true,
    },
  });
  const taskIds = [...new Set(runs.map((run) => run.taskId))];
  const tasks = taskIds.length
    ? await prisma.vegaTask.findMany({ where: { id: { in: taskIds } }, select: { id: true, title: true } })
    : [];
  const titles = new Map(tasks.map((task) => [task.id, task.title]));
  const ids = runs.flatMap((run) => (Array.isArray(run.actionIds) ? (run.actionIds as unknown[]) : [])).filter((id): id is string => typeof id === "string");
  const pending = ids.length
    ? new Set(
        (await prisma.vegaAction.findMany({ where: { userId, id: { in: ids }, status: "pending" }, select: { id: true } })).map((row) => row.id),
      )
    : new Set<string>();
  return runs.map((run) => ({
    id: run.id,
    taskId: run.taskId,
    title: titles.get(run.taskId) ?? "Rutina",
    scheduledFor: run.scheduledFor.toISOString(),
    status: run.status as VegaRoutineRunView["status"],
    result: run.result,
    pendingActions: pendingCount(run.actionIds, pending),
    conversationId: run.conversationId,
    seen: Boolean(run.seenAt),
  }));
}

export async function unseenRoutineRuns(userId: string) {
  return getPrisma().vegaRoutineRun.count({ where: { userId, seenAt: null, status: { in: ["done", "failed"] } } });
}

export async function markRoutineRunsSeen(userId: string, now = new Date()) {
  const updated = await getPrisma().vegaRoutineRun.updateMany({
    where: { userId, seenAt: null, status: { in: ["done", "failed", "skipped"] } },
    data: { seenAt: now },
  });
  return updated.count;
}
