// Despachador de rutinas (Fase 6).
//
// 1. Reclama las rutinas vencidas con un updateMany condicional (runAt = el que leímos)
//    y crea una VegaRoutineRun única por (taskId, scheduledFor): dos despachos a la vez
//    nunca ejecutan la misma ocurrencia dos veces.
// 2. Ejecuta las corridas en cola dentro del presupuesto de la invocación. Las tareas
//    corren un turno completo de Vega (presupuesto de la Fase 3) y obedecen la política
//    de la Fase 5: los envíos se quedan como tarjetas pendientes de confirmación.
import { sendWhatsappReminder } from "@/lib/ai/composio";
import { runUserTool, userAccount } from "@/lib/ai/composio-user";
import { chargeCredits, creditPrices, refundCharge } from "@/lib/credits";
import { getPrisma } from "@/lib/prisma";
import { canUseVega } from "@/lib/vega/access";
import { ensureDefaultVegaAgent } from "@/lib/vega/agents";
import { vegaLimits } from "@/lib/vega/budget";
import { nextRoutineRun } from "@/lib/vega/schedule";
import { routineConcurrency, routineRunsPerHour, taskSelect } from "@/lib/vega/tasks";
import { prepareVegaTurn, runVegaTurn } from "@/lib/vega/turn";

export const REMINDERS_CHAT_TITLE = "Recordatorios de Vega";
/** Una corrida «running» más vieja que esto se dio por perdida (la función murió). */
export const STALE_RUN_MS = 10 * 60_000;
/** Margen para guardar resultados y avisar después de un turno de Vega. */
const TURN_MARGIN_MS = 5_000;
const REMINDER_MS = 5_000;

type RoutineUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  package: string | null;
  suspendedUntil: Date | null;
  vegaWhatsapp: string | null;
};

type TurnOutcome =
  | { ok: true; content: string; actionIds: string[]; pendingIds: string[]; failed: boolean; stopReason: string | null; usage: unknown }
  | { ok: false; error: string; status?: number };

export type RunnerDeps = {
  canRun: (user: RoutineUser, now: Date) => boolean;
  chat: (userId: string) => Promise<{ id: string; agentId: string }>;
  charge: typeof chargeCredits;
  refund: typeof refundCharge;
  turn: (user: RoutineUser, input: { agentId: string; conversationId: string; message: string; requestId: string; channelNote: string }) => Promise<TurnOutcome>;
  notify: (user: RoutineUser, heading: string, text: string) => Promise<string[]>;
};

const userSelect = { id: true, name: true, email: true, role: true, package: true, suspendedUntil: true, vegaWhatsapp: true } as const;

export function routineChannelNote(title: string) {
  return [
    `Canal: rutina programada «${title}», ejecutada en segundo plano a la hora que el socio pidió.`,
    "El socio no está en línea: no le hagas preguntas ni esperes respuesta; haz la tarea completa con lo que tienes y entrega el resultado final, claro y breve.",
    "Cualquier envío (correo, mensaje, publicación) queda como tarjeta pendiente que el socio confirmará después; dilo en una frase y no digas que ya se envió.",
  ].join(" ");
}

async function remindersChat(userId: string) {
  const prisma = getPrisma();
  const agent = await ensureDefaultVegaAgent(userId);
  const existing = await prisma.vegaConversation.findFirst({
    where: { userId, agentId: agent.id, title: REMINDERS_CHAT_TITLE },
    select: { id: true },
  });
  const chat = existing ?? (await prisma.vegaConversation.create({ data: { userId, agentId: agent.id, title: REMINDERS_CHAT_TITLE }, select: { id: true } }));
  return { id: chat.id, agentId: agent.id };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
}

/** Avisos al propio socio (su correo y su WhatsApp); nunca a terceros. */
async function notifyOwner(user: RoutineUser, heading: string, text: string) {
  const channels: string[] = [];
  if (await userAccount(user.id, "gmail").catch(() => null)) {
    const sent = await runUserTool(user.id, "gmail", "GMAIL_SEND_EMAIL", {
      recipient_email: user.email,
      subject: `Vega · ${heading}`,
      is_html: true,
      body: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1E1E24"><p><strong>${escapeHtml(heading)}</strong></p><p style="white-space:pre-wrap">${escapeHtml(text)}</p><p style="color:#8A8680;font-size:12px">Enviado por Vega, tu superagente de LYRA. Administra tus rutinas en Super agente → Rutinas.</p></div>`,
    }).catch(() => ({ ok: false as const }));
    if (sent.ok) channels.push("correo");
  }
  if (user.vegaWhatsapp) {
    const sent = await sendWhatsappReminder(user.vegaWhatsapp, heading, text).catch(() => ({ sent: false as const }));
    if (sent.sent) channels.push("WhatsApp");
  }
  return channels;
}

async function backgroundTurn(user: RoutineUser, input: Parameters<RunnerDeps["turn"]>[1]): Promise<TurnOutcome> {
  const prepared = await prepareVegaTurn(user as never, { ...input, source: "routine" });
  if (!prepared.ok) return { ok: false, error: prepared.error, status: prepared.status };
  // Sin mensaje del socio: un «envíalo otra vez» guardado en la rutina no reabre acciones que él canceló.
  prepared.turn.userMessage = "";
  const pendingIds: string[] = [];
  const result = await runVegaTurn(prepared.turn, (event) => {
    if (event.t === "action" && event.v.status === "pending") pendingIds.push(event.v.id);
  });
  return {
    ok: true,
    content: result.content,
    actionIds: result.actionIds,
    pendingIds,
    failed: result.failed,
    stopReason: result.stopReason ?? null,
    usage: result.usage ?? null,
  };
}

export const defaultRunnerDeps: RunnerDeps = {
  canRun: (user, now) => canUseVega(user as never) && !(user.suspendedUntil && user.suspendedUntil > now),
  chat: remindersChat,
  charge: chargeCredits,
  refund: refundCharge,
  turn: backgroundTurn,
  notify: notifyOwner,
};

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "P2002");
}

/** Marca como fallidas las corridas que quedaron «running» porque la función murió. Sin reintento: nada corre dos veces. */
export async function recoverStaleRuns(now: Date) {
  const updated = await getPrisma().vegaRoutineRun.updateMany({
    where: { status: "running", startedAt: { lt: new Date(now.getTime() - STALE_RUN_MS) } },
    data: { status: "failed", finishedAt: now, result: "Se interrumpió antes de terminar. No se reintenta para no duplicar nada." },
  });
  return updated.count;
}

type ClaimOutcome = "queued" | "skipped" | "duplicate" | "paused" | "rate-limited";

/** Reclama una ocurrencia vencida: avanza runAt (o termina) y crea su corrida única. */
export async function claimTask(taskId: string, now: Date, deps: RunnerDeps = defaultRunnerDeps, horizonMs = 0): Promise<ClaimOutcome> {
  const prisma = getPrisma();
  const task = await prisma.vegaTask.findUnique({ where: { id: taskId }, select: { ...taskSelect, userId: true } });
  if (!task || task.status !== "active" || task.runAt.getTime() > now.getTime() + horizonMs) return "skipped";
  const user = (await prisma.user.findUnique({ where: { id: task.userId }, select: userSelect })) as RoutineUser | null;
  if (!user || !deps.canRun(user, now)) {
    await prisma.vegaTask.updateMany({
      where: { id: task.id, status: "active" },
      data: { status: "paused", lastResult: "En pausa: la cuenta no tiene Vega activa." },
    });
    return "paused";
  }

  // Las recurrentes saltan lo atrasado: una sola corrida aunque se hayan perdido varias.
  const next = nextRoutineRun(task, new Date(Math.max(now.getTime(), task.runAt.getTime())));
  const claimed = await prisma.vegaTask.updateMany({
    where: { id: task.id, status: "active", runAt: task.runAt },
    data: { ...(next ? { runAt: next } : { status: "done" }), lastRunAt: now, runCount: { increment: 1 } },
  });
  if (claimed.count === 0) return "skipped";

  const recent = await prisma.vegaRoutineRun.count({
    where: { userId: user.id, createdAt: { gte: new Date(now.getTime() - 3_600_000) }, status: { not: "skipped" } },
  });
  const limit = routineRunsPerHour();
  const limited = recent >= limit;
  try {
    await prisma.vegaRoutineRun.create({
      data: {
        taskId: task.id,
        userId: user.id,
        scheduledFor: task.runAt,
        createdAt: now,
        status: limited ? "skipped" : "queued",
        ...(limited ? { finishedAt: now, result: `Omitida: llegaste al límite de ${limit} rutinas por hora.` } : {}),
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return "duplicate";
    throw error;
  }
  if (limited) {
    await prisma.vegaTask.update({ where: { id: task.id }, data: { lastResult: `Omitida: límite de ${limit} rutinas por hora.` } });
    return "rate-limited";
  }
  return "queued";
}

function joinChannels(channels: string[]) {
  return channels.join(", ").replace(/, ([^,]*)$/, " y $1");
}

type RunOutcome = "done" | "failed" | "skipped" | "no-credits";

/** Ejecuta una corrida en cola. Solo un proceso puede pasarla de queued → running. */
export async function executeRun(runId: string, now: Date, deps: RunnerDeps = defaultRunnerDeps): Promise<RunOutcome> {
  const prisma = getPrisma();
  const claimed = await prisma.vegaRoutineRun.updateMany({
    where: { id: runId, status: "queued" },
    data: { status: "running", startedAt: now, attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return "skipped";
  const run = await prisma.vegaRoutineRun.findUnique({ where: { id: runId }, select: { id: true, taskId: true, userId: true, scheduledFor: true } });
  const task = run ? await prisma.vegaTask.findUnique({ where: { id: run.taskId }, select: { ...taskSelect, userId: true } }) : null;
  const user = run ? ((await prisma.user.findUnique({ where: { id: run.userId }, select: userSelect })) as RoutineUser | null) : null;

  const finish = async (status: "done" | "failed" | "skipped", result: string, extra: Record<string, unknown> = {}) => {
    await prisma.vegaRoutineRun.update({ where: { id: runId }, data: { status, result: result.slice(0, 4000), finishedAt: new Date(), ...extra } });
    if (task) {
      await prisma.vegaTask.update({
        where: { id: task.id },
        data: { lastResult: result.slice(0, 500), ...(status === "failed" ? { failCount: { increment: 1 } } : {}) },
      });
    }
  };

  if (!run || !task || !user) {
    await prisma.vegaRoutineRun.updateMany({ where: { id: runId }, data: { status: "skipped", finishedAt: now, result: "La rutina ya no existe." } });
    return "skipped";
  }
  if (!deps.canRun(user, now)) {
    await finish("skipped", "Omitida: la cuenta no tiene Vega activa.");
    return "skipped";
  }

  const late = now.getTime() - run.scheduledFor.getTime() > 30 * 60_000 ? " (con retraso)" : "";
  const chat = await deps.chat(user.id);

  if (task.kind !== "task") {
    const charge = await deps.charge(user.id, creditPrices.vegaMessage, `Vega · recordatorio: ${task.title}`, `vega:${user.id}:routine-${run.id}:aviso`);
    if (!charge.ok) {
      await prisma.vegaMessage.create({
        data: { conversationId: chat.id, role: "assistant", content: `No pude darte el recordatorio «${task.title}» porque no te alcanzaron los créditos. Recarga en Billetera.` },
      });
      await finish("failed", "No se ejecutó: sin créditos suficientes.", { conversationId: chat.id });
      return "no-credits";
    }
    const heading = `Recordatorio: ${task.title}${late}`;
    const text = task.instruction || task.title;
    await prisma.vegaMessage.create({
      data: { conversationId: chat.id, role: "assistant", content: `**${heading}**\n\n${text}`, meta: { taskId: task.id, routineRunId: run.id } },
    });
    await prisma.vegaConversation.updateMany({ where: { id: chat.id }, data: { updatedAt: new Date() } });
    const channels = await deps.notify(user, heading, text).catch(() => [] as string[]);
    await finish("done", `Entregado en ${joinChannels(["Vega", ...channels])}.`, { conversationId: chat.id });
    return "done";
  }

  const web = task.useWeb ? "\n(Busca en la web información actual antes de responder.)" : "";
  const outcome = await deps
    .turn(user, {
      agentId: chat.agentId,
      conversationId: chat.id,
      message: `⏰ Rutina «${task.title}»${late}: ${task.instruction}${web}`.slice(0, 4000),
      requestId: `routine-${run.id}`,
      channelNote: routineChannelNote(task.title),
    })
    .catch((error: unknown): TurnOutcome => ({ ok: false, error: error instanceof Error ? error.message : "El turno de Vega falló." }));

  if (!outcome.ok && outcome.status === 429) {
    // Tope mensual de costo de IA (Fase 7): no se ejecuta ni se cobra; queda omitida con el aviso.
    await finish("skipped", `Omitida: ${outcome.error}`.slice(0, 500), { conversationId: chat.id });
    return "skipped";
  }
  if (!outcome.ok) {
    const noCredits = outcome.status === 402;
    if (noCredits) {
      await prisma.vegaMessage.create({
        data: { conversationId: chat.id, role: "assistant", content: `No pude ejecutar la rutina «${task.title}» porque no te alcanzaron los créditos. Recarga en Billetera.` },
      });
    }
    await finish("failed", noCredits ? "No se ejecutó: sin créditos suficientes." : `No se pudo ejecutar: ${outcome.error}`.slice(0, 300), { conversationId: chat.id });
    return noCredits ? "no-credits" : "failed";
  }

  const pending = outcome.pendingIds.length;
  const summary = outcome.content.trim() || (outcome.failed ? "Vega no pudo terminar esta rutina." : "Rutina ejecutada.");
  const pendingNote = pending ? `\n\nDejé ${pending} ${pending === 1 ? "acción esperando" : "acciones esperando"} tu confirmación en Vega.` : "";
  const heading = `Rutina: ${task.title}${late}`;
  const channels = outcome.failed ? [] : await deps.notify(user, heading, `${summary}${pendingNote}`.slice(0, 3500)).catch(() => [] as string[]);
  await finish(
    outcome.failed ? "failed" : "done",
    outcome.failed
      ? summary
      : `${summary.slice(0, 1500)}${pendingNote}${channels.length ? `\n\nAvisado por ${joinChannels(channels)}.` : ""}`,
    { conversationId: chat.id, actionIds: outcome.actionIds, usage: (outcome.usage ?? null) as never },
  );
  return outcome.failed ? "failed" : "done";
}

export type DispatchOptions = {
  now?: Date;
  /** Tiempo total disponible para esta invocación (ms). */
  budgetMs?: number;
  /** Solo rutinas de este socio (p. ej. disparo oportunista). */
  userId?: string;
  /** Adelanta lo que vence dentro de esta ventana (el cron diario de Hobby llega con ±59 min). */
  horizonMs?: number;
  deps?: RunnerDeps;
  clock?: () => number;
};

export async function dispatchRoutines(options: DispatchOptions = {}) {
  const clock = options.clock ?? Date.now;
  const started = clock();
  const budgetMs = options.budgetMs ?? 50_000;
  const deps = options.deps ?? defaultRunnerDeps;
  const now = options.now ?? new Date(started);
  const prisma = getPrisma();
  const summary: Record<string, number> = { stale: await recoverStaleRuns(now) };
  const bump = (key: string) => (summary[key] = (summary[key] ?? 0) + 1);

  const due = await prisma.vegaTask.findMany({
    where: { status: "active", runAt: { lte: new Date(now.getTime() + (options.horizonMs ?? 0)) }, ...(options.userId ? { userId: options.userId } : {}) },
    orderBy: { runAt: "asc" },
    take: 100,
    select: { id: true },
  });
  for (const { id } of due) {
    if (clock() - started > budgetMs / 2) break;
    bump(await claimTask(id, now, deps, options.horizonMs ?? 0).catch(() => "error"));
  }

  const queued = await prisma.vegaRoutineRun.findMany({
    where: { status: "queued", ...(options.userId ? { userId: options.userId } : {}) },
    orderBy: { scheduledFor: "asc" },
    take: 50,
    select: { id: true, taskId: true, userId: true },
  });
  const turnMs = vegaLimits().timeBudgetMs + TURN_MARGIN_MS;
  const kinds = new Map(
    (queued.length
      ? await prisma.vegaTask.findMany({ where: { id: { in: queued.map((run) => run.taskId) } }, select: { id: true, kind: true } })
      : []
    ).map((task) => [task.id, task.kind]),
  );
  // Recordatorios primero (son rápidos); luego tareas en lotes paralelos mientras alcance un turno completo.
  const reminders = queued.filter((run) => kinds.get(run.taskId) !== "task");
  const jobs = queued.filter((run) => kinds.get(run.taskId) === "task");
  for (const run of reminders) {
    if (budgetMs - (clock() - started) < REMINDER_MS) {
      bump("deferred");
      continue;
    }
    bump(await executeRun(run.id, new Date(clock()), deps).catch(() => "error"));
  }
  // Un lote nunca lleva dos tareas del mismo socio: comparten el chat «Recordatorios de Vega».
  const parallel = routineConcurrency();
  const pendingJobs = [...jobs];
  while (pendingJobs.length) {
    const batch: typeof jobs = [];
    const users = new Set<string>();
    for (let index = 0; index < pendingJobs.length && batch.length < parallel; ) {
      if (users.has(pendingJobs[index].userId)) {
        index += 1;
        continue;
      }
      users.add(pendingJobs[index].userId);
      batch.push(...pendingJobs.splice(index, 1));
    }
    if (budgetMs - (clock() - started) < turnMs) {
      [...batch, ...pendingJobs].forEach(() => bump("deferred"));
      break;
    }
    const outcomes = await Promise.all(batch.map((run) => executeRun(run.id, new Date(clock()), deps).catch(() => "error" as const)));
    outcomes.forEach(bump);
  }
  return { due: due.length, ...summary };
}
