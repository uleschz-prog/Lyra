import { chargeCredits, creditPrices, refundCharge } from "@/lib/credits";
import { getPrisma } from "@/lib/prisma";
import { runProspectAgent } from "@/lib/telegram/agent";
import { TelegramClient } from "@/lib/telegram/client";
import { decryptSecret } from "@/lib/telegram/crypto";
import { sendToChat } from "@/lib/telegram/deliver";
import { logTelegram } from "@/lib/telegram/log";
import { canUseTelegram, followupPlan, proactiveBlock, withinSendingWindow } from "@/lib/telegram/rules";

export async function cancelFollowups(chatRowId: string, reason: string) {
  await getPrisma().telegramFollowup.updateMany({
    where: { chatRowId, status: "scheduled" },
    data: { status: "cancelled", lastError: reason },
  });
}

export async function scheduleFollowup(
  chat: { id: string; userId: string; connectionId: string },
  minutes: number,
  step: number,
  createdBy: "system" | "agent" | "human",
  note?: string,
) {
  await cancelFollowups(chat.id, "Reemplazado por un seguimiento nuevo.");
  const runAt = withinSendingWindow(new Date(Date.now() + minutes * 60_000));
  return getPrisma().telegramFollowup.create({
    data: { userId: chat.userId, connectionId: chat.connectionId, chatRowId: chat.id, step, runAt, createdBy, note: note?.slice(0, 300) },
    select: { id: true, runAt: true },
  });
}

async function runOne(id: string, now: Date) {
  const prisma = getPrisma();
  const claimed = await prisma.telegramFollowup.updateMany({
    where: { id, status: "scheduled", runAt: { lte: now } },
    data: { status: "processing", attempts: { increment: 1 }, claimedAt: now },
  });
  if (!claimed.count) return "skipped";

  const job = await prisma.telegramFollowup.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      step: true,
      attempts: true,
      note: true,
      chat: {
        select: {
          id: true,
          chatId: true,
          userId: true,
          connectionId: true,
          optedIn: true,
          isBlocked: true,
          automation: true,
          autoSent: true,
          firstName: true,
          username: true,
          campaign: true,
          stage: true,
          notes: true,
        },
      },
      connection: {
        select: {
          status: true,
          automation: true,
          followups: true,
          tokenEnc: true,
          instructions: true,
          user: { select: { name: true, role: true, package: true, suspendedUntil: true } },
        },
      },
    },
  });
  const { chat, connection } = job;
  const finish = (status: "sent" | "cancelled" | "failed", lastError?: string) =>
    prisma.telegramFollowup.update({ where: { id }, data: { status, lastError: lastError ?? null, executedAt: new Date() } });

  const blocked =
    proactiveBlock({
      optedIn: chat.optedIn,
      isBlocked: chat.isBlocked,
      automation: chat.automation,
      autoSent: chat.autoSent,
      connectionStatus: connection.status,
      connectionAutomation: connection.automation,
      connectionFollowups: connection.followups,
      hasChatId: Boolean(chat.chatId),
    }) ??
    (!canUseTelegram(connection.user) || (connection.user.suspendedUntil && connection.user.suspendedUntil > now)
      ? "El plan del socio no incluye el bot de Telegram."
      : null);
  if (blocked) {
    await finish("cancelled", blocked);
    return "cancelled";
  }

  const window = withinSendingWindow(now);
  if (window.getTime() !== now.getTime()) {
    await prisma.telegramFollowup.update({ where: { id }, data: { status: "scheduled", runAt: window } });
    return "rescheduled";
  }

  const charge = await chargeCredits(chat.userId, creditPrices.telegramReply, "Telegram · seguimiento", `tgf:${id}:${job.attempts}`);
  if (!charge.ok) {
    await finish("failed", "Sin créditos suficientes.");
    return "no-credits";
  }
  if (charge.duplicate) {
    await finish("sent");
    return "skipped";
  }

  const history = await prisma.telegramMessage.findMany({
    where: { chatRowId: chat.id },
    orderBy: { createdAt: "desc" },
    take: 16,
    select: { direction: true, senderType: true, text: true },
  });
  const generated = await runProspectAgent({
    ownerName: connection.user.name,
    instructions: connection.instructions,
    contactName: chat.firstName || chat.username || "el prospecto",
    campaign: chat.campaign,
    stage: chat.stage,
    notes: [chat.notes, job.note].filter(Boolean).join(" · ") || null,
    history: history.reverse(),
    mode: "followup",
    followupStep: job.step,
  }).catch(() => ({ ok: false as const, error: "El agente falló.", effects: [] }));
  if (!generated.ok) {
    await refundCharge(charge.chargeId, "Reembolso: el seguimiento de Telegram no se generó");
    if (job.attempts < 3) {
      await prisma.telegramFollowup.update({ where: { id }, data: { status: "scheduled", runAt: new Date(now.getTime() + 60 * 60_000), lastError: generated.error } });
      return "retry";
    }
    await finish("failed", generated.error);
    return "failed";
  }

  const client = new TelegramClient(decryptSecret(connection.tokenEnc));
  const sent = await sendToChat(client, chat, generated.text, "agent");
  if (!sent.ok) {
    await refundCharge(charge.chargeId, "Reembolso: Telegram no entregó el seguimiento");
    if ((sent.code === "rate_limited" || sent.code === "timeout" || sent.code === "network") && job.attempts < 3) {
      await prisma.telegramFollowup.update({ where: { id }, data: { status: "scheduled", runAt: new Date(now.getTime() + 15 * 60_000), lastError: sent.error } });
      return "retry";
    }
    await finish("failed", sent.error);
    return "failed";
  }

  await prisma.telegramChat.update({ where: { id: chat.id }, data: { autoSent: { increment: 1 } } });
  await finish("sent");
  const plan = followupPlan();
  if (job.step < plan.length) await scheduleFollowup(chat, plan[job.step], job.step + 1, "system");
  return "sent";
}

/** Envía los seguimientos vencidos. Seguro de ejecutar en paralelo: cada uno se reclama una sola vez. */
export async function runDueFollowups(budgetMs = 40_000, limit = 50) {
  const started = Date.now();
  const now = new Date();
  await getPrisma().telegramFollowup.updateMany({
    where: { status: "processing", claimedAt: { lt: new Date(now.getTime() - 15 * 60_000) } },
    data: { status: "scheduled" },
  });
  const due = await getPrisma().telegramFollowup.findMany({
    where: { status: "scheduled", runAt: { lte: now } },
    orderBy: { runAt: "asc" },
    take: limit,
    select: { id: true },
  });
  const summary: Record<string, number> = {};
  for (const { id } of due) {
    if (Date.now() - started > budgetMs) break;
    const outcome = await runOne(id, now).catch(() => "error");
    summary[outcome] = (summary[outcome] ?? 0) + 1;
  }
  if (due.length) logTelegram("followups", { due: due.length, ...summary, durationMs: Date.now() - started });
  return { due: due.length, ...summary };
}
