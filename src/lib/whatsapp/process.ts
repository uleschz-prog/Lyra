import type { Prisma } from "@prisma/client";

import { chargeCredits, creditPrices, refundCharge } from "@/lib/credits";
import { getPrisma } from "@/lib/prisma";
import { runProspectAgent, type AgentEffect } from "@/lib/whatsapp/agent/prospect-agent";
import { canUseProspectAgent } from "@/lib/whatsapp/agent/prospect-rules";
import { canUseVega } from "@/lib/vega/access";
import { decideAction } from "@/lib/vega/decide";
import { prepareVegaTurn, runVegaTurn } from "@/lib/vega/turn";
import { normalizePhone } from "@/lib/whatsapp/crypto";
import { isWhatsappOptOut, type WhatsappInbound } from "@/lib/whatsapp/parse";
import { sendWhatsappText, splitWhatsappText } from "@/lib/whatsapp/send";

const CHAT_BURST = 8;
const BOT_BURST = 30;

export const connectionSelect = {
  id: true,
  userId: true,
  phoneNumberId: true,
  instructions: true,
  ownerPhone: true,
  status: true,
  automation: true,
  lastError: true,
  user: { select: { id: true, name: true, role: true, package: true, suspendedUntil: true, vegaWhatsapp: true } },
} satisfies Prisma.WhatsappConnectionSelect;

export type WhatsappConnection = Prisma.WhatsappConnectionGetPayload<{ select: typeof connectionSelect }>;

function plainReply(text: string) {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").trim();
}

/** Busca la conexión por phone_number_id; si no existe, la crea para la cuenta administradora. */
export async function resolveConnection(phoneNumberId: string): Promise<WhatsappConnection | null> {
  const prisma = getPrisma();
  const existing = await prisma.whatsappConnection.findUnique({ where: { phoneNumberId }, select: connectionSelect });
  if (existing) return existing;
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, vegaWhatsapp: true },
  });
  if (!admin) return null;
  const created = await prisma.whatsappConnection
    .create({
      data: {
        userId: admin.id,
        phoneNumberId,
        ownerPhone: normalizePhone(admin.vegaWhatsapp) || normalizePhone(process.env.WHATSAPP_OWNER_PHONE) || null,
      },
      select: connectionSelect,
    })
    .catch(() => null);
  return created;
}

function actionSummary(kind: string, payload: unknown) {
  const draft = payload as { to?: string; subject?: string; body?: string; title?: string; text?: string; name?: string };
  if (kind === "send_email") return `Correo para ${draft.to}\nAsunto: ${draft.subject}\n\n${draft.body ?? ""}`;
  if (kind === "create_event") return `Evento: ${draft.title}`;
  if (kind === "whatsapp_message") return `WhatsApp${draft.name ? ` para ${draft.name}` : ""}:\n\n${draft.text}`;
  return "Acción preparada.";
}

/** Mensajes del socio: su WhatsApp responde como Vega Bot; «confirmar»/«cancelar» decide la última acción pendiente. */
async function handleOwner(connection: WhatsappConnection, inbound: WhatsappInbound): Promise<string> {
  const user = connection.user;
  if (!canUseVega(user)) {
    await sendWhatsappText(connection.phoneNumberId, inbound.from, "Para platicar con Vega desde WhatsApp activa Founder, Corporate o Vega Partner.");
    return "owner-no-vega";
  }
  const ownerChat = await getPrisma().whatsappChat.findUnique({
    where: { connectionId_phone: { connectionId: connection.id, phone: inbound.from } },
    select: { id: true, lastPendingActionId: true },
  });

  const decision = inbound.text.trim().toLowerCase();
  if (ownerChat?.lastPendingActionId && (decision === "confirmar" || decision === "cancelar")) {
    const decided = await decideAction(user.id, ownerChat.lastPendingActionId, decision === "confirmar");
    await getPrisma().whatsappChat.update({ where: { id: ownerChat.id }, data: { lastPendingActionId: null } });
    await sendWhatsappText(connection.phoneNumberId, inbound.from, decided.message);
    return "owner-decided";
  }

  const text = inbound.text || (inbound.hasMedia ? "(Te envié un archivo; por ahora solo leo texto.)" : "");
  if (!text) return "owner-empty";

  const title = "WhatsApp";
  const prepared = await prepareVegaTurn(user, {
    conversationId: null,
    message: text.slice(0, 4000),
    requestId: `wa-${connection.id.slice(-8)}-${inbound.waMessageId.slice(-16)}`,
    title,
    channelNote:
      "Canal: WhatsApp. Responde en texto plano breve, sin tablas ni markdown. Si preparas una acción, te confirmarán escribiendo «confirmar» o «cancelar».",
  });
  if (!prepared.ok) {
    if (prepared.status !== 409) await sendWhatsappText(connection.phoneNumberId, inbound.from, prepared.error);
    return "owner-error";
  }

  const pendingActions: { id: string; kind: string; payload: unknown }[] = [];
  let errorText = "";
  const result = await runVegaTurn(prepared.turn, (event) => {
    if (event.t === "action" && event.v.status === "pending") pendingActions.push({ id: event.v.id, kind: event.v.kind, payload: event.v.payload });
    if (event.t === "error") errorText = event.v;
  });
  const reply = result.content || errorText;
  if (reply) {
    for (const chunk of splitWhatsappText(plainReply(reply))) {
      await sendWhatsappText(connection.phoneNumberId, inbound.from, chunk);
    }
  }
  for (const action of pendingActions) {
    await sendWhatsappText(
      connection.phoneNumberId,
      inbound.from,
      `${actionSummary(action.kind, action.payload)}\n\nResponde «confirmar» para ejecutarla o «cancelar» para descartarla.`,
    );
    await getPrisma().whatsappChat.update({
      where: { id: ownerChat?.id ?? (await ensureOwnerChat(connection, inbound.from)).id },
      data: { lastPendingActionId: action.id },
    });
  }
  return "owner-vega";
}

async function ensureOwnerChat(connection: WhatsappConnection, phone: string) {
  const prisma = getPrisma();
  return prisma.whatsappChat.upsert({
    where: { connectionId_phone: { connectionId: connection.id, phone } },
    create: { userId: connection.userId, connectionId: connection.id, phone, name: "Socio" },
    update: {},
    select: { id: true },
  });
}

async function notifyOwner(connection: WhatsappConnection, text: string) {
  const owner = connection.ownerPhone ?? normalizePhone(connection.user.vegaWhatsapp);
  if (!owner) return;
  await sendWhatsappText(connection.phoneNumberId, owner, text);
}

async function applyEffects(connection: WhatsappConnection, chat: { id: string; phone: string; name: string | null }, effects: AgentEffect[]) {
  const prisma = getPrisma();
  let stop = false;
  for (const effect of effects) {
    if (effect.type === "lead") {
      const current = await prisma.whatsappChat.findUnique({ where: { id: chat.id }, select: { notes: true } });
      const notes = effect.note ? [current?.notes, effect.note].filter(Boolean).join("\n").slice(-1500) : undefined;
      await prisma.whatsappChat.update({
        where: { id: chat.id },
        data: { ...(effect.stage ? { stage: effect.stage } : {}), ...(effect.intent ? { intent: effect.intent } : {}), ...(notes ? { notes } : {}) },
      });
    } else if (effect.type === "handoff") {
      stop = true;
      await prisma.whatsappChat.update({ where: { id: chat.id }, data: { automation: "escalated" } });
      await notifyOwner(connection, `${chat.name ?? chat.phone} necesita hablar contigo por WhatsApp.\nMotivo: ${effect.reason}`);
    } else if (effect.type === "close") {
      stop = true;
      await prisma.whatsappChat.update({ where: { id: chat.id }, data: { automation: "closed" } });
    } else if (effect.type === "followup") {
      // Seguimientos programados: fase 2 de WhatsApp.
    }
  }
  return { stop };
}

async function handleProspect(connection: WhatsappConnection, inbound: WhatsappInbound, messageRowId: string): Promise<string> {
  const prisma = getPrisma();
  const now = new Date();
  const existing = await prisma.whatsappChat.findUnique({
    where: { connectionId_phone: { connectionId: connection.id, phone: inbound.from } },
    select: { id: true, optedOutAt: true },
  });
  const chat = await prisma.whatsappChat.upsert({
    where: { connectionId_phone: { connectionId: connection.id, phone: inbound.from } },
    create: { userId: connection.userId, connectionId: connection.id, phone: inbound.from, name: inbound.name, lastInboundAt: now },
    update: { name: inbound.name ?? undefined, lastInboundAt: now },
    select: { id: true, phone: true, name: true, userId: true, optedOutAt: true, automation: true, stage: true, notes: true },
  });
  await prisma.whatsappMessage.update({ where: { id: messageRowId }, data: { chatRowId: chat.id } });

  if (isWhatsappOptOut(inbound.text)) {
    await prisma.whatsappChat.update({ where: { id: chat.id }, data: { optedOutAt: now, automation: "paused_by_contact" } });
    await sendWhatsappText(connection.phoneNumberId, inbound.from, "Listo, ya no recibirás mensajes automáticos.");
    return "opt-out";
  }
  if (existing?.optedOutAt) return "opted-out";
  if (chat.automation === "escalated" || chat.automation === "paused_by_human") {
    await notifyOwner(connection, `${chat.name ?? chat.phone} escribió: ${(inbound.text || "(archivo)").slice(0, 600)}`);
    return "human";
  }
  if (chat.automation !== "active" || connection.status !== "active" || !connection.automation) return "paused";
  if (!canUseProspectAgent(connection.user) || (connection.user.suspendedUntil && connection.user.suspendedUntil > now)) {
    return "no-plan";
  }

  const minuteAgo = new Date(now.getTime() - 60_000);
  const [chatBurst, botBurst] = await Promise.all([
    prisma.whatsappMessage.count({ where: { chatRowId: chat.id, direction: "inbound", createdAt: { gte: minuteAgo } } }),
    prisma.whatsappMessage.count({ where: { connectionId: connection.id, direction: "outbound", createdAt: { gte: minuteAgo } } }),
  ]);
  if (chatBurst > CHAT_BURST || botBurst > BOT_BURST) return "rate-limited";

  const charge = await chargeCredits(connection.userId, creditPrices.botReply, "WhatsApp · respuesta automática", `wa:${connection.id}:${inbound.waMessageId}`);
  if (!charge.ok) {
    const warning = "Tu agente de WhatsApp dejó de responder porque no tienes créditos. Recarga en Billetera.";
    if (connection.lastError !== warning) {
      await prisma.whatsappConnection.update({ where: { id: connection.id }, data: { lastError: warning } });
      await notifyOwner(connection, warning);
    }
    return "no-credits";
  }
  if (charge.duplicate) return "duplicate";

  const history = await prisma.whatsappMessage.findMany({
    where: { chatRowId: chat.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { direction: true, senderType: true, text: true },
  });
  const generated = await runProspectAgent({
    ownerName: connection.user.name,
    instructions: connection.instructions,
    contactName: chat.name ?? chat.phone,
    campaign: null,
    stage: chat.stage,
    notes: chat.notes,
    history: history.reverse(),
    mode: "reply",
  }).catch(() => ({ ok: false as const, error: "El agente falló.", effects: [] as AgentEffect[] }));

  if (!generated.ok) {
    await refundCharge(charge.chargeId, "Reembolso: el agente de WhatsApp no respondió");
    return "agent-failed";
  }
  let delivered = true;
  for (const chunk of splitWhatsappText(generated.text)) {
    const sent = await sendWhatsappText(connection.phoneNumberId, chat.phone, chunk);
    if (!sent.ok) {
      await prisma.whatsappMessage.create({
        data: { userId: connection.userId, connectionId: connection.id, chatRowId: chat.id, direction: "outbound", senderType: "agent", text: chunk, status: "failed", error: sent.error.slice(0, 300) },
      });
      delivered = false;
    } else {
      await prisma.whatsappMessage.create({
        data: { userId: connection.userId, connectionId: connection.id, chatRowId: chat.id, waMessageId: sent.waMessageId, direction: "outbound", senderType: "agent", text: chunk },
      });
    }
  }
  if (!delivered) {
    await refundCharge(charge.chargeId, "Reembolso: WhatsApp no entregó la respuesta");
    return "send-failed";
  }
  await applyEffects(connection, chat, generated.effects);
  return "replied";
}

/** Procesa un mensaje entrante ya guardado; se ejecuta después de responder 200 a Meta. */
export async function processWhatsappMessage(connectionId: string, inbound: WhatsappInbound, messageRowId: string) {
  const prisma = getPrisma();
  const connection = await prisma.whatsappConnection.findUnique({ where: { id: connectionId }, select: connectionSelect });
  if (!connection || connection.status === "disconnected") return "no-connection";
  const owner = connection.ownerPhone ?? normalizePhone(connection.user.vegaWhatsapp);
  if (owner && inbound.from === owner) return handleOwner(connection, inbound);
  return handleProspect(connection, inbound, messageRowId);
}
