import { getPrisma } from "@/lib/prisma";
import { listMetaWhatsappTemplates, sendMetaWhatsapp } from "@/lib/whatsapp/meta-business";

const CUSTOMER_WINDOW_MS = 24 * 60 * 60_000;

async function failSchedule(id: string, reason: string) {
  await getPrisma().whatsappScheduledMessage.updateMany({
    where: { id, status: "sending" },
    data: { status: "failed", error: reason.slice(0, 500) },
  });
}

async function sendOne(id: string, now: Date) {
  const prisma = getPrisma();
  const row = await prisma.whatsappScheduledMessage.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      userId: true,
      connectionId: true,
      chatRowId: true,
      recipientPhone: true,
      kind: true,
      text: true,
      templateName: true,
      language: true,
      variables: true,
      consentConfirmed: true,
      chat: { select: { optedOutAt: true, lastInboundAt: true, consentAt: true } },
      connection: { select: { status: true } },
    },
  });
  if (!row || row.status !== "sending") return "skipped";

  if (!row.consentConfirmed) {
    await failSchedule(id, "No se encontró confirmación de consentimiento.");
    return "failed";
  }
  if (row.kind === "template" && !row.chat.consentAt) {
    await failSchedule(id, "El consentimiento ya no está registrado para este contacto.");
    return "failed";
  }
  if (row.chat.optedOutAt || (await prisma.vegaWhatsappBlock.findUnique({ where: { userId_phone: { userId: row.userId, phone: row.recipientPhone } } }))) {
    await failSchedule(id, "El contacto está en la lista de no molestar.");
    return "blocked";
  }
  if (row.connection.status !== "active") {
    await failSchedule(id, "La conexión de WhatsApp Business está desconectada.");
    return "failed";
  }

  let message: { text: string } | { template: string; language: string; variables: string[] };
  if (row.kind === "text") {
    if (!row.text || !row.chat.lastInboundAt || now.getTime() - row.chat.lastInboundAt.getTime() >= CUSTOMER_WINDOW_MS) {
      await failSchedule(id, "La ventana de atención de Meta venció; programa una plantilla aprobada.");
      return "window-expired";
    }
    message = { text: row.text };
  } else if (row.kind === "template" && row.templateName && row.language) {
    const templates = await listMetaWhatsappTemplates(row.userId);
    if (!templates.ok) {
      await failSchedule(id, templates.error);
      return "failed";
    }
    const selected = templates.templates.find((template) => template.name === row.templateName && template.language === row.language);
    const variables = Array.isArray(row.variables) ? row.variables.filter((value): value is string => typeof value === "string") : [];
    if (!selected || selected.variables !== variables.length) {
      await failSchedule(id, "La plantilla ya no está aprobada o sus variables cambiaron.");
      return "template-invalid";
    }
    message = { template: row.templateName, language: row.language, variables };
  } else {
    await failSchedule(id, "El formato del mensaje programado no es válido.");
    return "failed";
  }

  const sent = await sendMetaWhatsapp(row.userId, row.recipientPhone, message);
  if (!sent.ok) {
    await prisma.$transaction(async (tx) => {
      await tx.whatsappScheduledMessage.updateMany({
        where: { id, status: "sending" },
        data: { status: "failed", error: sent.error.slice(0, 500) },
      });
      await tx.whatsappMessage.create({
        data: {
          userId: row.userId,
          connectionId: row.connectionId,
          chatRowId: row.chatRowId,
          scheduledMessageId: row.id,
          direction: "outbound",
          senderType: "human",
          text: messageText(message),
          status: "failed",
          error: sent.error.slice(0, 300),
        },
      });
    });
    return "failed";
  }

  await prisma.$transaction(async (tx) => {
    await tx.whatsappScheduledMessage.updateMany({
      where: { id, status: "sending" },
      data: { status: "sent", sentAt: now, waMessageId: sent.waMessageId, error: null },
    });
    await tx.whatsappMessage.create({
      data: {
        userId: row.userId,
        connectionId: row.connectionId,
        chatRowId: row.chatRowId,
        scheduledMessageId: row.id,
        waMessageId: sent.waMessageId,
        direction: "outbound",
        senderType: "human",
        text: messageText(message),
        status: "sent",
      },
    });
    await tx.whatsappChat.update({ where: { id: row.chatRowId }, data: { autoSent: { increment: 1 } } });
  });
  return "sent";
}

function messageText(message: { text: string } | { template: string; language: string; variables: string[] }) {
  return "text" in message ? message.text : `[Plantilla ${message.template}] ${message.variables.join(" · ")}`;
}

export async function runDueWhatsappMessages(budgetMs = 50_000) {
  const prisma = getPrisma();
  const now = new Date();
  const startedAt = Date.now();

  const stale = await prisma.whatsappScheduledMessage.updateMany({
    where: { status: "sending", updatedAt: { lt: new Date(now.getTime() - 10 * 60_000) } },
    data: { status: "failed", error: "Resultado incierto: verifica el estado en WhatsApp antes de volver a enviar." },
  });
  const due = await prisma.whatsappScheduledMessage.findMany({
    where: { status: "scheduled", runAt: { lte: now } },
    orderBy: { runAt: "asc" },
    take: 100,
    select: { id: true },
  });

  const summary: Record<string, number> = {};
  for (const { id } of due) {
    if (Date.now() - startedAt > budgetMs) break;
    const claimed = await prisma.whatsappScheduledMessage.updateMany({
      where: { id, status: "scheduled", runAt: { lte: now } },
      data: { status: "sending" },
    });
    if (!claimed.count) continue;
    const outcome = await sendOne(id, now).catch(async () => {
      await failSchedule(id, "No se pudo completar el envío. Verifica WhatsApp antes de reintentar.");
      return "failed";
    });
    summary[outcome] = (summary[outcome] ?? 0) + 1;
  }

  const connected = await prisma.whatsappConnection.count({ where: { status: "active", accessTokenEncrypted: { not: null } } });
  return { due: due.length, staleMarkedFailed: stale.count, connectedNumbers: connected, ...summary };
}
