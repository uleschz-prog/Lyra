import { generateText } from "@/lib/ai/generate";
import { sendWhatsappReminder } from "@/lib/ai/composio";
import { runUserTool, userAccount } from "@/lib/ai/composio-user";
import { searchWeb } from "@/lib/ai/search";
import { chargeCredits, creditPrices, refundCharge } from "@/lib/credits";
import { getPrisma } from "@/lib/prisma";
import { canUseVega } from "@/lib/vega/access";
import { listMemories, memoryPrompt } from "@/lib/vega/memory";
import { type TaskKind, type TaskRepeat, type VegaTaskView } from "@/lib/vega/tasks-shared";

export { DAILY_HOUR, repeatLabels, type TaskKind, type TaskRepeat, type VegaTaskView } from "@/lib/vega/tasks-shared";

export const TASK_LIMIT = 20;
const OFFSET_HOURS = -6;

/** Convierte una fecha local de Ciudad de México (YYYY-MM-DD y HH:MM) a UTC. */
export function localToUtc(date: string, time = "07:00") {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - OFFSET_HOURS, minute));
}

function localParts(value: Date) {
  const shifted = new Date(value.getTime() + OFFSET_HOURS * 3_600_000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate() };
}

/** Siguiente medianoche de Ciudad de México, en UTC. */
export function endOfLocalDay(now = new Date()) {
  const { year, month, day } = localParts(now);
  return new Date(Date.UTC(year, month, day + 1, -OFFSET_HOURS, 0));
}

function nextRun(runAt: Date, repeat: TaskRepeat, now: Date) {
  if (repeat === "once") return null;
  let next = new Date(runAt);
  const end = endOfLocalDay(now);
  while (next < end) {
    if (repeat === "daily") next = new Date(next.getTime() + 86_400_000);
    else if (repeat === "weekly") next = new Date(next.getTime() + 7 * 86_400_000);
    else {
      const moved = new Date(next);
      moved.setUTCMonth(moved.getUTCMonth() + 1);
      next = moved;
    }
  }
  return next;
}

function view(task: {
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
}): VegaTaskView {
  return {
    ...task,
    kind: task.kind as TaskKind,
    repeat: task.repeat as TaskRepeat,
    status: task.status as VegaTaskView["status"],
    runAt: task.runAt.toISOString(),
    lastRunAt: task.lastRunAt?.toISOString() ?? null,
  };
}

const taskSelect = {
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
} as const;

export async function listTasks(userId: string, includeDone = false) {
  const rows = await getPrisma().vegaTask.findMany({
    where: { userId, ...(includeDone ? {} : { status: { in: ["active", "paused"] } }) },
    orderBy: [{ status: "asc" }, { runAt: "asc" }],
    take: 50,
    select: taskSelect,
  });
  return rows.map(view);
}

export async function createTask(
  userId: string,
  input: { title: string; instruction: string; kind: TaskKind; repeat: TaskRepeat; useWeb: boolean; date: string; time?: string },
) {
  const prisma = getPrisma();
  const active = await prisma.vegaTask.count({ where: { userId, status: { in: ["active", "paused"] } } });
  if (active >= TASK_LIMIT) {
    return { ok: false as const, error: `Ya tienes ${TASK_LIMIT} tareas programadas. Cancela alguna para agregar otra.` };
  }
  let runAt = localToUtc(input.date, input.time);
  const today = endOfLocalDay();
  if (runAt.getTime() < today.getTime() - 86_400_000) {
    if (input.repeat === "once") return { ok: false as const, error: "Esa fecha ya pasó." };
    runAt = nextRun(runAt, input.repeat, new Date()) ?? runAt;
  }
  const task = await prisma.vegaTask.create({
    data: {
      userId,
      title: input.title.slice(0, 120),
      instruction: input.instruction.slice(0, 1000),
      kind: input.kind,
      repeat: input.repeat,
      useWeb: input.kind === "task" && input.useWeb,
      runAt,
    },
    select: taskSelect,
  });
  return { ok: true as const, task: view(task) };
}

export async function setTaskStatus(userId: string, id: string, status: "active" | "paused" | "done") {
  const updated = await getPrisma().vegaTask.updateMany({ where: { id, userId }, data: { status } });
  return updated.count > 0;
}

export async function deleteTask(userId: string, id: string) {
  const deleted = await getPrisma().vegaTask.deleteMany({ where: { id, userId } });
  return deleted.count > 0;
}

async function remindersChat(userId: string) {
  const prisma = getPrisma();
  const title = "Recordatorios de Vega";
  const existing = await prisma.vegaConversation.findFirst({ where: { userId, title }, select: { id: true } });
  return existing ?? prisma.vegaConversation.create({ data: { userId, title }, select: { id: true } });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
}

async function produce(task: { title: string; instruction: string; kind: string; useWeb: boolean }, user: { id: string; name: string }) {
  if (task.kind === "reminder") return { ok: true as const, text: task.instruction || task.title };

  let context = "";
  if (task.useWeb) {
    const found = await searchWeb(task.instruction.slice(0, 280), 5);
    if (found.ok && found.value.length) {
      context = `\n\nResultados de búsqueda de hoy:\n${found.value
        .map((item, index) => `[${index + 1}] ${item.title} — ${item.url}\n${item.highlight}`)
        .join("\n")}`;
    }
  }
  const memories = await listMemories(user.id).catch(() => []);
  const result = await generateText({
    system: [
      `Eres Vega, el superagente de LYRA de ${user.name}. Estás ejecutando una tarea programada que el socio te pidió.`,
      "Responde en español, directo y útil, en menos de 250 palabras. Si usas resultados de búsqueda, cita con [n] y lista las fuentes al final.",
      memoryPrompt(memories),
    ].join("\n"),
    user: `Tarea: ${task.title}\nInstrucción: ${task.instruction}${context}`,
    temperature: 0.5,
  }).catch(() => null);
  if (!result || result.mode !== "live" || !result.text.trim()) return { ok: false as const, text: "" };
  return { ok: true as const, text: result.text.trim() };
}

async function runOne(taskId: string, now: Date) {
  const prisma = getPrisma();
  const task = await prisma.vegaTask.findUnique({
    where: { id: taskId },
    select: {
      ...taskSelect,
      user: { select: { id: true, name: true, email: true, role: true, package: true, suspendedUntil: true, vegaWhatsapp: true } },
    },
  });
  if (!task || task.status !== "active") return "skipped";
  const user = task.user;

  const next = nextRun(task.runAt, task.repeat as TaskRepeat, now);
  const advance = next ? { runAt: next } : { status: "done" };

  if (!canUseVega(user) || (user.suspendedUntil && user.suspendedUntil > now)) {
    await prisma.vegaTask.update({ where: { id: task.id }, data: { status: "paused", lastResult: "Pausada: la cuenta no tiene Vega activa." } });
    return "paused";
  }

  const claimed = await prisma.vegaTask.updateMany({
    where: { id: task.id, status: "active", runAt: task.runAt },
    data: { ...advance, lastRunAt: now },
  });
  if (claimed.count === 0) return "skipped";

  const retryOnce = (lastResult: string) =>
    prisma.vegaTask.update({
      where: { id: task.id },
      data: task.repeat === "once" ? { status: "active", runAt: task.runAt, lastResult } : { lastResult },
    });

  const price = task.kind === "task" ? creditPrices.vegaTool : creditPrices.vegaMessage;
  const charge = await chargeCredits(
    user.id,
    price,
    `Vega · ${task.kind === "task" ? "tarea" : "recordatorio"}: ${task.title}`,
    `task:${task.id}:${task.runAt.toISOString()}:${now.toISOString().slice(0, 10)}`,
  );
  if (!charge.ok) {
    await retryOnce("No se ejecutó: sin créditos suficientes.");
    const chat = await remindersChat(user.id);
    await prisma.vegaMessage.create({
      data: { conversationId: chat.id, role: "assistant", content: `No pude ejecutar «${task.title}» porque no te alcanzaron los créditos. Recarga en Billetera.` },
    });
    await prisma.vegaConversation.update({ where: { id: chat.id }, data: { updatedAt: now } });
    return "no-credits";
  }
  if (charge.duplicate) return "skipped";

  const output = await produce(task, user);
  if (!output.ok) {
    await refundCharge(charge.chargeId, `Reembolso: la tarea «${task.title}» no se pudo ejecutar`);
    await retryOnce("La IA no respondió; se reintenta en la siguiente revisión.");
    return "failed";
  }

  const heading = task.kind === "task" ? `Tarea programada: ${task.title}` : `Recordatorio: ${task.title}`;
  const chat = await remindersChat(user.id);
  await prisma.vegaMessage.create({
    data: { conversationId: chat.id, role: "assistant", content: `**${heading}**\n\n${output.text}`, meta: { taskId: task.id } },
  });
  await prisma.vegaConversation.update({ where: { id: chat.id }, data: { updatedAt: now } });

  let emailed = false;
  if (await userAccount(user.id, "gmail").catch(() => null)) {
    const sent = await runUserTool(user.id, "gmail", "GMAIL_SEND_EMAIL", {
      recipient_email: user.email,
      subject: `Vega · ${heading}`,
      is_html: true,
      body: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1E1E24"><p><strong>${escapeHtml(heading)}</strong></p><p style="white-space:pre-wrap">${escapeHtml(output.text)}</p><p style="color:#8A8680;font-size:12px">Enviado por Vega, tu superagente de LYRA. Administra tus tareas en Super agente.</p></div>`,
    }).catch(() => ({ ok: false as const }));
    emailed = sent.ok;
  }

  let whatsapped = false;
  if (user.vegaWhatsapp) {
    const sent = await sendWhatsappReminder(user.vegaWhatsapp, heading, output.text).catch(() => ({ sent: false as const }));
    whatsapped = sent.sent;
  }

  const channels = ["Vega", emailed && "correo", whatsapped && "WhatsApp"].filter(Boolean);
  await prisma.vegaTask.update({
    where: { id: task.id },
    data: { lastResult: `Entregado en ${channels.join(", ").replace(/, ([^,]*)$/, " y $1")}.` },
  });
  return "done";
}

/** Ejecuta las tareas que vencen hoy (hora de Ciudad de México). */
export async function runDueTasks(budgetMs = 50_000) {
  const started = Date.now();
  const now = new Date();
  const due = await getPrisma().vegaTask.findMany({
    where: { status: "active", runAt: { lt: endOfLocalDay(now) } },
    orderBy: { runAt: "asc" },
    take: 200,
    select: { id: true },
  });
  const summary: Record<string, number> = {};
  for (const { id } of due) {
    if (Date.now() - started > budgetMs) break;
    const outcome = await runOne(id, now).catch(() => "error");
    summary[outcome] = (summary[outcome] ?? 0) + 1;
  }
  return { due: due.length, ...summary };
}
