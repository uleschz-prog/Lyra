"use server";

import { headers } from "next/headers";

import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";
import {
  clientFor,
  connectBot,
  disconnectBot,
  getConnection,
  ownerLink,
  updateSettings,
  verifyConnection,
  type TelegramConnectionView,
} from "@/lib/telegram/connections";
import { sendToChat } from "@/lib/telegram/deliver";
import { cancelFollowups } from "@/lib/telegram/followups";
import { createTelegramDeepLink, sanitizeCampaign } from "@/lib/telegram/parse";
import { canUseTelegram } from "@/lib/telegram/rules";

export type TelegramChatView = {
  id: string;
  name: string;
  username: string | null;
  campaign: string | null;
  stage: string;
  intent: string | null;
  automation: string;
  optedIn: boolean;
  isBlocked: boolean;
  lastText: string;
  lastAt: string;
};

export type TelegramMessageView = { id: string; direction: string; senderType: string; text: string; status: string; createdAt: string };

export type TelegramStats = { chats: number; leads7d: number; inbound7d: number; outbound7d: number; escalated: number; optOuts: number; scheduled: number };

export type TelegramOverview = {
  allowed: boolean;
  connection: TelegramConnectionView | null;
  chats: TelegramChatView[];
  campaigns: { code: string; chats: number }[];
  stats: TelegramStats;
};

const emptyStats: TelegramStats = { chats: 0, leads7d: 0, inbound7d: 0, outbound7d: 0, escalated: 0, optOuts: 0, scheduled: 0 };
const attempts = new Map<string, number[]>();

async function member() {
  const user = await getCurrentUser();
  return user && canUseTelegram(user) ? user : null;
}

function tooManyAttempts(userId: string) {
  const now = Date.now();
  const recent = (attempts.get(userId) ?? []).filter((time) => now - time < 10 * 60_000);
  recent.push(now);
  attempts.set(userId, recent);
  return recent.length > 6;
}

function chatName(chat: { firstName: string | null; lastName: string | null; username: string | null }) {
  return [chat.firstName, chat.lastName].filter(Boolean).join(" ") || (chat.username ? `@${chat.username}` : "Contacto");
}

export async function telegramOverview(): Promise<TelegramOverview> {
  const user = await getCurrentUser();
  if (!user || !canUseTelegram(user)) return { allowed: false, connection: null, chats: [], campaigns: [], stats: emptyStats };
  const connection = await getConnection(user.id);
  if (!connection) return { allowed: true, connection: null, chats: [], campaigns: [], stats: emptyStats };

  const prisma = getPrisma();
  const week = new Date(Date.now() - 7 * 24 * 3600_000);
  const where = { connectionId: connection.id, userId: user.id };
  const [rows, campaigns, chats, leads7d, inbound7d, outbound7d, escalated, optOuts, scheduled] = await Promise.all([
    prisma.telegramChat.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 60,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        campaign: true,
        stage: true,
        intent: true,
        automation: true,
        optedIn: true,
        isBlocked: true,
        updatedAt: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { text: true, createdAt: true } },
      },
    }),
    prisma.telegramChat.groupBy({ by: ["campaign"], where: { ...where, campaign: { not: null } }, _count: { _all: true } }),
    prisma.telegramChat.count({ where }),
    prisma.telegramChat.count({ where: { ...where, createdAt: { gte: week } } }),
    prisma.telegramMessage.count({ where: { ...where, direction: "inbound", createdAt: { gte: week } } }),
    prisma.telegramMessage.count({ where: { ...where, direction: "outbound", createdAt: { gte: week } } }),
    prisma.telegramChat.count({ where: { ...where, automation: "escalated" } }),
    prisma.telegramChat.count({ where: { ...where, optedIn: false } }),
    prisma.telegramFollowup.count({ where: { ...where, status: "scheduled" } }),
  ]);

  return {
    allowed: true,
    connection,
    chats: rows.map((row) => ({
      id: row.id,
      name: chatName(row),
      username: row.username,
      campaign: row.campaign,
      stage: row.stage,
      intent: row.intent,
      automation: row.automation,
      optedIn: row.optedIn,
      isBlocked: row.isBlocked,
      lastText: row.messages[0]?.text.slice(0, 140) ?? "",
      lastAt: (row.messages[0]?.createdAt ?? row.updatedAt).toISOString(),
    })),
    campaigns: campaigns
      .map((item) => ({ code: item.campaign ?? "", chats: item._count._all }))
      .filter((item) => item.code)
      .sort((a, b) => b.chats - a.chats),
    stats: { chats, leads7d, inbound7d, outbound7d, escalated, optOuts, scheduled },
  };
}

export async function connectTelegram(token: string) {
  const user = await member();
  if (!user) return { ok: false as const, error: "El bot de Telegram está incluido en Negocio, Pro y Corporate." };
  if (tooManyAttempts(user.id)) return { ok: false as const, error: "Demasiados intentos. Espera unos minutos." };
  const origin = `https://${(await headers()).get("host")}`;
  const result = await connectBot(user.id, String(token ?? ""), origin).catch(() => ({
    ok: false as const,
    error: "No se pudo conectar el bot. Intenta de nuevo.",
  }));
  return result;
}

export async function verifyTelegram() {
  const user = await member();
  if (!user) return { ok: false as const, error: "No disponible." };
  return verifyConnection(user.id).catch(() => ({ ok: false as const, error: "No se pudo verificar el bot." }));
}

export async function disconnectTelegram() {
  const user = await member();
  if (!user) return { ok: false as const };
  return disconnectBot(user.id);
}

export async function saveTelegramSettings(input: { instructions?: string; automation?: boolean; followups?: boolean; paused?: boolean }) {
  const user = await member();
  if (!user) return { ok: false as const, error: "No disponible." };
  const connection = await updateSettings(user.id, input);
  return connection ? { ok: true as const, connection } : { ok: false as const, error: "No tienes un bot conectado." };
}

export async function telegramOwnerLink() {
  const user = await member();
  if (!user) return { ok: false as const, error: "No disponible." };
  const url = await ownerLink(user.id);
  return url ? { ok: true as const, url } : { ok: false as const, error: "Conecta tu bot primero." };
}

export async function telegramDeepLink(campaign: string) {
  const user = await member();
  if (!user) return { ok: false as const, error: "No disponible." };
  const connection = await getConnection(user.id);
  if (!connection) return { ok: false as const, error: "Conecta tu bot primero." };
  const code = sanitizeCampaign(String(campaign ?? "").trim().toLowerCase().replace(/\s+/g, "_"));
  if (!code || code.startsWith("owner_")) return { ok: false as const, error: "Usa solo letras, números, guion o guion bajo (máximo 64)." };
  const url = createTelegramDeepLink(connection.botUsername, code);
  return url ? { ok: true as const, url, code } : { ok: false as const, error: "No se pudo crear el enlace." };
}

async function ownChat(userId: string, chatRowId: string) {
  return getPrisma().telegramChat.findFirst({
    where: { id: chatRowId, userId, connection: { userId, status: { not: "disconnected" } } },
    select: { id: true, chatId: true, userId: true, connectionId: true, optedIn: true, isBlocked: true, automation: true },
  });
}

export async function telegramChatMessages(chatRowId: string): Promise<TelegramMessageView[]> {
  const user = await member();
  if (!user) return [];
  const chat = await ownChat(user.id, chatRowId);
  if (!chat) return [];
  const rows = await getPrisma().telegramMessage.findMany({
    where: { chatRowId: chat.id, userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, direction: true, senderType: true, text: true, status: true, createdAt: true },
  });
  return rows.reverse().map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function setTelegramChatAutomation(chatRowId: string, active: boolean) {
  const user = await member();
  if (!user) return { ok: false as const, error: "No disponible." };
  const chat = await ownChat(user.id, chatRowId);
  if (!chat) return { ok: false as const, error: "Ese chat ya no existe." };
  if (active && !chat.optedIn) return { ok: false as const, error: "Este contacto pidió la baja. Solo se reactiva si vuelve a escribir /start." };
  await getPrisma().telegramChat.update({ where: { id: chat.id }, data: { automation: active ? "active" : "paused_by_human" } });
  if (!active) await cancelFollowups(chat.id, "Pausado por el socio.");
  return { ok: true as const, automation: active ? "active" : "paused_by_human" };
}

export async function replyTelegramChat(chatRowId: string, text: string) {
  const user = await member();
  if (!user) return { ok: false as const, error: "No disponible." };
  const message = String(text ?? "").trim().slice(0, 4000);
  if (!message) return { ok: false as const, error: "Escribe un mensaje." };
  const chat = await ownChat(user.id, chatRowId);
  if (!chat) return { ok: false as const, error: "Ese chat ya no existe." };
  if (chat.isBlocked) return { ok: false as const, error: "El contacto bloqueó al bot." };
  const client = await clientFor(chat.connectionId, user.id);
  if (!client) return { ok: false as const, error: "Tu bot no está conectado." };
  const sent = await sendToChat(client, chat, message, "human");
  if (!sent.ok) return { ok: false as const, error: sent.error };
  if (chat.automation === "active" || chat.automation === "escalated") {
    await getPrisma().telegramChat.update({ where: { id: chat.id }, data: { automation: "paused_by_human" } });
    await cancelFollowups(chat.id, "El socio tomó la conversación.");
  }
  return { ok: true as const };
}

export async function sendTelegramTest() {
  const user = await member();
  if (!user) return { ok: false as const, error: "No disponible." };
  const prisma = getPrisma();
  const connection = await prisma.telegramConnection.findUnique({ where: { userId: user.id }, select: { id: true, ownerChatId: true, status: true } });
  if (!connection || connection.status === "disconnected") return { ok: false as const, error: "Conecta tu bot primero." };
  if (!connection.ownerChatId) return { ok: false as const, error: "Vincula tu Telegram primero: Telegram solo permite escribir a quien ya inició el bot." };
  const client = await clientFor(connection.id, user.id);
  if (!client) return { ok: false as const, error: "Tu bot no está conectado." };
  const sent = await client.sendText(connection.ownerChatId, "Prueba de LYRA: tu bot está conectado y puede escribirte.");
  return sent.ok ? { ok: true as const } : { ok: false as const, error: sent.error };
}
