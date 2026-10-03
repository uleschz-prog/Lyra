import type { Prisma } from "@prisma/client";

import { chargeCredits, creditPrices, refundCharge } from "@/lib/credits";
import { getPrisma } from "@/lib/prisma";
import { runProspectAgent, type AgentEffect } from "@/lib/telegram/agent";
import { TelegramClient } from "@/lib/telegram/client";
import { decryptSecret } from "@/lib/telegram/crypto";
import { notifyOwner, sendToChat, type ChatRef } from "@/lib/telegram/deliver";
import { cancelFollowups, scheduleFollowup } from "@/lib/telegram/followups";
import { logTelegram } from "@/lib/telegram/log";
import { isOptOut, sanitizeCampaign, type Inbound } from "@/lib/telegram/parse";
import { canUseTelegram, delayMinutes, followupPlan } from "@/lib/telegram/rules";
import { canUseVega } from "@/lib/vega/access";
import { decideAction } from "@/lib/vega/decide";
import type { VegaActionView } from "@/lib/vega/events";
import type { AppDraft, EmailDraft, EventDraft, WhatsappDraft } from "@/lib/vega/tools";
import { prepareVegaTurn, runVegaTurn } from "@/lib/vega/turn";

const CHAT_BURST = 8;
const BOT_BURST = 30;

const connectionSelect = {
  id: true,
  userId: true,
  status: true,
  automation: true,
  followups: true,
  instructions: true,
  tokenEnc: true,
  ownerChatId: true,
  ownerLinkCode: true,
  lastError: true,
  user: { select: { id: true, name: true, role: true, package: true, suspendedUntil: true } },
} satisfies Prisma.TelegramConnectionSelect;

type Connection = Prisma.TelegramConnectionGetPayload<{ select: typeof connectionSelect }>;

function contactName(from: Inbound["from"]) {
  return [from?.firstName, from?.lastName].filter(Boolean).join(" ") || (from?.username ? `@${from.username}` : "Contacto");
}

function actionSummary(action: VegaActionView) {
  const payload = action.payload;
  if (action.kind === "send_email") {
    const email = payload as EmailDraft;
    return `Correo para ${email.to}\nAsunto: ${email.subject}\n\n${email.body}`;
  }
  if (action.kind === "create_event") {
    const event = payload as EventDraft;
    return `Evento: ${event.title}\n${event.start.replace("T", " ")} a ${event.end.split("T")[1] ?? ""} (Ciudad de México)${event.meet ? "\nCon enlace de Google Meet" : ""}`;
  }
  if (action.kind === "whatsapp_message") {
    const draft = payload as WhatsappDraft;
    return `WhatsApp${draft.name ? ` para ${draft.name}` : ""}:\n\n${draft.text}`;
  }
  const app = payload as AppDraft;
  return [app.title, ...app.lines.map((line) => `${line.label}: ${line.value}`), app.body ?? ""].filter(Boolean).join("\n");
}

/** Mensajes del socio vinculado: su bot le responde como Vega Bot. */
async function handleOwner(connection: Connection, client: TelegramClient, inbound: Inbound) {
  const user = connection.user;
  const chatId = inbound.chatId!;
  if (!canUseVega(user)) {
    await client.sendText(chatId, "Aquí te aviso cuando un prospecto pida hablar contigo. Para platicar con Vega Bot desde Telegram activa Pro o Corporate.");
    return "owner-no-vega";
  }
  const text = inbound.text || (inbound.hasMedia ? "(Te envié un archivo; por ahora solo leo texto.)" : "");
  if (!text) return "owner-empty";

  const prisma = getPrisma();
  const title = "Telegram";
  const existing = await prisma.vegaConversation.findFirst({ where: { userId: user.id, title }, orderBy: { updatedAt: "desc" }, select: { id: true } });
  await client.sendChatAction(chatId);
  const prepared = await prepareVegaTurn(user, {
    conversationId: existing?.id ?? null,
    message: text.slice(0, 4000),
    requestId: `tg-${connection.id.slice(-8)}-${inbound.updateId}`,
    title,
    channelNote:
      "Canal: Telegram. Responde en texto plano breve, sin tablas. Las acciones que prepares le llegan al socio con botones Confirmar y Cancelar en este mismo chat.",
  });
  if (!prepared.ok) {
    if (prepared.status !== 409) await client.sendText(chatId, prepared.error);
    return "owner-error";
  }
  const actions: VegaActionView[] = [];
  let errorText = "";
  const result = await runVegaTurn(prepared.turn, (event) => {
    if (event.t === "action") actions.push(event.v);
    if (event.t === "error") errorText = event.v;
  });
  const reply = result.content || errorText;
  if (reply) await client.sendText(chatId, reply.replace(/\*\*(.+?)\*\*/g, "$1"));
  for (const action of actions) {
    if (action.kind === "whatsapp_message") {
      const draft = action.payload as WhatsappDraft;
      const url = `https://wa.me/${draft.phone ?? ""}?text=${encodeURIComponent(draft.text)}`;
      await client.sendText(chatId, actionSummary(action), { buttons: [[{ text: "Abrir en WhatsApp", url }]] });
    } else {
      await client.sendText(chatId, actionSummary(action), {
        buttons: [[{ text: "Confirmar", data: `va:${action.id}:1` }, { text: "Cancelar", data: `va:${action.id}:0` }]],
      });
    }
  }
  return "owner-vega";
}

async function handleCallback(connection: Connection, client: TelegramClient, inbound: Inbound) {
  const match = inbound.callbackData?.match(/^va:([a-z0-9]{10,40}):([01])$/);
  if (!match || !inbound.callbackId) return "callback-ignored";
  if (!connection.ownerChatId || inbound.chatId !== connection.ownerChatId) {
    await client.answerCallback(inbound.callbackId, "Solo el dueño del bot puede confirmar.");
    return "callback-denied";
  }
  const decided = await decideAction(connection.userId, match[1], match[2] === "1");
  await client.answerCallback(inbound.callbackId, decided.ok ? "Listo" : "No se completó");
  if (inbound.messageId) await client.editButtons(inbound.chatId, inbound.messageId);
  await client.sendText(inbound.chatId, decided.message.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1: $2"));
  return "callback-decided";
}

async function applyEffects(
  connection: Connection,
  client: TelegramClient,
  chat: ChatRef & { name: string },
  effects: AgentEffect[],
) {
  const prisma = getPrisma();
  let scheduled = false;
  let stop = false;
  for (const effect of effects) {
    if (effect.type === "lead") {
      const current = await prisma.telegramChat.findUnique({ where: { id: chat.id }, select: { notes: true } });
      const notes = effect.note ? [current?.notes, effect.note].filter(Boolean).join("\n").slice(-1500) : undefined;
      await prisma.telegramChat.update({
        where: { id: chat.id },
        data: { ...(effect.stage ? { stage: effect.stage } : {}), ...(effect.intent ? { intent: effect.intent } : {}), ...(notes ? { notes } : {}) },
      });
    } else if (effect.type === "handoff") {
      stop = true;
      await prisma.telegramChat.update({ where: { id: chat.id }, data: { automation: "escalated" } });
      await cancelFollowups(chat.id, "Pasó al socio.");
      await notifyOwner(client, connection.ownerChatId, `${chat.name} necesita hablar contigo.\nMotivo: ${effect.reason}\n\nRespóndele desde LYRA, en Agentes > Telegram. El bot dejó de contestarle hasta que lo reactives.`);
      logTelegram("handoff", { userId: chat.userId, connectionId: chat.connectionId, chatId: chat.chatId });
    } else if (effect.type === "followup" && !stop) {
      scheduled = true;
      await scheduleFollowup(chat, delayMinutes[effect.delay], 1, "agent", effect.reason);
    } else if (effect.type === "close") {
      stop = true;
      await prisma.telegramChat.update({ where: { id: chat.id }, data: { automation: "closed" } });
      await cancelFollowups(chat.id, "Conversación cerrada.");
    }
  }
  return { scheduled, stop };
}

async function handleProspect(connection: Connection, client: TelegramClient, inbound: Inbound, messageRowId: string) {
  const prisma = getPrisma();
  const chatId = inbound.chatId!;
  const now = new Date();
  const campaign = inbound.command === "start" ? sanitizeCampaign(inbound.payload) : null;
  const profile = {
    tgUserId: inbound.from?.id ?? null,
    username: inbound.from?.username ?? null,
    firstName: inbound.from?.firstName ?? null,
    lastName: inbound.from?.lastName ?? null,
    languageCode: inbound.from?.languageCode ?? null,
  };
  const existing = await prisma.telegramChat.findUnique({
    where: { connectionId_chatId: { connectionId: connection.id, chatId } },
    select: { id: true, optedIn: true, campaign: true },
  });
  const restart = inbound.command === "start" && existing && !existing.optedIn;
  const chat = await prisma.telegramChat.upsert({
    where: { connectionId_chatId: { connectionId: connection.id, chatId } },
    create: { userId: connection.userId, connectionId: connection.id, chatId, ...profile, campaign, lastInboundAt: now },
    update: {
      ...profile,
      lastInboundAt: now,
      isBlocked: false,
      autoSent: 0,
      ...(campaign && !existing?.campaign ? { campaign } : {}),
      ...(restart ? { optedIn: true, optedInAt: now, optedOutAt: null, automation: "active" } : {}),
    },
    select: { id: true, chatId: true, userId: true, connectionId: true, optedIn: true, automation: true, stage: true, notes: true, campaign: true },
  });
  await prisma.telegramMessage.update({ where: { id: messageRowId }, data: { chatRowId: chat.id } });
  await cancelFollowups(chat.id, "El contacto respondió.");
  const name = contactName(inbound.from);
  const ref = { ...chat, name };

  if (!existing) {
    logTelegram("lead", { userId: connection.userId, connectionId: connection.id, chatId, campaign: chat.campaign ?? undefined });
    await notifyOwner(client, connection.ownerChatId, `Nuevo prospecto en tu bot: ${name}${chat.campaign ? ` (campaña ${chat.campaign})` : ""}.`);
  }

  if (isOptOut(inbound)) {
    await prisma.telegramChat.update({
      where: { id: chat.id },
      data: { optedIn: false, optedOutAt: now, automation: "paused_by_contact" },
    });
    await cancelFollowups(chat.id, "El contacto pidió la baja.");
    await sendToChat(client, chat, "Listo, ya no recibirás mensajes automáticos. Si cambias de opinión, escribe /start.", "system");
    logTelegram("opt_out", { userId: connection.userId, connectionId: connection.id, chatId });
    return "opt-out";
  }

  if (!chat.optedIn) return "opted-out";
  if (chat.automation === "escalated" || chat.automation === "paused_by_human") {
    await notifyOwner(client, connection.ownerChatId, `${name} escribió: ${(inbound.text || "(archivo)").slice(0, 600)}`);
    return "human";
  }
  if (chat.automation !== "active" || connection.status !== "active" || !connection.automation) return "paused";
  if (!canUseTelegram(connection.user) || (connection.user.suspendedUntil && connection.user.suspendedUntil > now)) {
    await prisma.telegramConnection.update({ where: { id: connection.id }, data: { lastError: "Tu plan no incluye el agente de Telegram. Activa Negocio, Pro o Corporate." } });
    return "no-plan";
  }

  const minuteAgo = new Date(now.getTime() - 60_000);
  const [chatBurst, botBurst] = await Promise.all([
    prisma.telegramMessage.count({ where: { chatRowId: chat.id, direction: "inbound", createdAt: { gte: minuteAgo } } }),
    prisma.telegramMessage.count({ where: { connectionId: connection.id, direction: "outbound", createdAt: { gte: minuteAgo } } }),
  ]);
  if (chatBurst > CHAT_BURST || botBurst > BOT_BURST) {
    logTelegram("rate_limited", { userId: connection.userId, connectionId: connection.id, chatId, chatBurst, botBurst });
    return "rate-limited";
  }

  const charge = await chargeCredits(connection.userId, creditPrices.telegramReply, "Telegram · respuesta automática", `tg:${connection.id}:${inbound.updateId}`);
  if (!charge.ok) {
    const warning = "Tu bot de Telegram dejó de responder porque no tienes créditos. Recarga en Billetera.";
    if (connection.lastError !== warning) {
      await prisma.telegramConnection.update({ where: { id: connection.id }, data: { lastError: warning } });
      await notifyOwner(client, connection.ownerChatId, warning);
    }
    return "no-credits";
  }
  if (charge.duplicate) return "duplicate";

  await client.sendChatAction(chatId);
  const history = await prisma.telegramMessage.findMany({
    where: { chatRowId: chat.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { direction: true, senderType: true, text: true },
  });
  const started = Date.now();
  const generated = await runProspectAgent({
    ownerName: connection.user.name,
    instructions: connection.instructions,
    contactName: name,
    campaign: chat.campaign,
    stage: chat.stage,
    notes: chat.notes,
    history: history.reverse(),
    mode: "reply",
  }).catch(() => ({ ok: false as const, error: "El agente falló.", effects: [] as AgentEffect[] }));
  logTelegram("agent", { userId: connection.userId, connectionId: connection.id, chatId, status: generated.ok ? "ok" : "failed", durationMs: Date.now() - started });

  if (!generated.ok) {
    await refundCharge(charge.chargeId, "Reembolso: el agente de Telegram no respondió");
    return "agent-failed";
  }
  const sent = await sendToChat(client, chat, generated.text, "agent", { replyTo: inbound.messageId ?? undefined });
  if (!sent.ok) {
    await refundCharge(charge.chargeId, "Reembolso: Telegram no entregó la respuesta");
    return "send-failed";
  }
  if (connection.lastError) await prisma.telegramConnection.update({ where: { id: connection.id }, data: { lastError: null } });

  const effects = await applyEffects(connection, client, ref, generated.effects);
  if (!effects.scheduled && !effects.stop && connection.followups) {
    const plan = followupPlan();
    if (plan.length) await scheduleFollowup(chat, plan[0], 1, "system");
  }
  return "replied";
}

/** Procesa un update ya guardado. Se ejecuta después de responder 200 a Telegram. */
export async function processUpdate(connectionId: string, inbound: Inbound, messageRowId: string | null) {
  const prisma = getPrisma();
  const started = Date.now();
  const connection = await prisma.telegramConnection.findUnique({ where: { id: connectionId }, select: connectionSelect });
  if (!connection || connection.status === "disconnected" || !connection.tokenEnc) return "no-connection";
  const client = new TelegramClient(decryptSecret(connection.tokenEnc));
  let outcome = "ignored";

  try {
    if (inbound.kind === "callback") outcome = await handleCallback(connection, client, inbound);
    else if (!inbound.chatId || inbound.chatType !== "private") outcome = "ignored";
    else if (inbound.kind === "blocked" || inbound.kind === "unblocked") {
      const blocked = inbound.kind === "blocked";
      const chat = await prisma.telegramChat.findUnique({ where: { connectionId_chatId: { connectionId, chatId: inbound.chatId } }, select: { id: true } });
      if (chat) {
        await prisma.telegramChat.update({ where: { id: chat.id }, data: { isBlocked: blocked } });
        if (blocked) await cancelFollowups(chat.id, "El contacto bloqueó al bot.");
      }
      outcome = blocked ? "blocked" : "unblocked";
    } else if (inbound.kind === "edited") outcome = "edited";
    else if (inbound.kind === "message") {
      const ownerCode = inbound.command === "start" && inbound.payload?.startsWith("owner_") ? inbound.payload : null;
      if (ownerCode && connection.ownerLinkCode && ownerCode === connection.ownerLinkCode) {
        await prisma.telegramConnection.update({ where: { id: connectionId }, data: { ownerChatId: inbound.chatId, ownerLinkCode: null } });
        await client.sendText(
          inbound.chatId,
          canUseVega(connection.user)
            ? "Listo, vinculé tu Telegram. Escríbeme aquí y te respondo como Vega Bot. También te aviso cuando un prospecto pida hablar contigo."
            : "Listo, vinculé tu Telegram. Aquí te aviso de prospectos nuevos y de quienes pidan hablar contigo.",
        );
        outcome = "owner-linked";
      } else if (ownerCode) {
        await client.sendText(inbound.chatId, "Ese enlace de vinculación ya se usó o caducó. Genera uno nuevo en LYRA.");
        outcome = "owner-link-invalid";
      } else if (connection.ownerChatId && inbound.chatId === connection.ownerChatId) {
        outcome = await handleOwner(connection, client, inbound);
      } else if (messageRowId) {
        outcome = await handleProspect(connection, client, inbound, messageRowId);
      }
    }
  } catch (error) {
    outcome = "error";
    logTelegram("process_error", { userId: connection.userId, connectionId, updateId: inbound.updateId, errorCode: error instanceof Error ? error.name : "unknown" });
  }

  if (messageRowId) await prisma.telegramMessage.update({ where: { id: messageRowId }, data: { status: outcome } }).catch(() => null);
  logTelegram("inbound", { userId: connection.userId, connectionId, chatId: inbound.chatId, updateId: inbound.updateId, status: outcome, durationMs: Date.now() - started });
  return outcome;
}
