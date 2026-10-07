"use server";

import { headers } from "next/headers";

import { composioConfigured } from "@/lib/ai/composio";
import { disconnectUser, forgetConnections, userConnectUrl, userConnections, type UserToolkit } from "@/lib/ai/composio-user";
import { getCurrentUser } from "@/lib/auth/profile";
import { currentCredits } from "@/lib/credits";
import { getPrisma } from "@/lib/prisma";
import { canUseVega } from "@/lib/vega/access";
import { isUserToolkit, noConnections } from "@/lib/vega/apps";
import { attachmentChips } from "@/lib/vega/attachments";
import type { VegaActionView, VegaSource } from "@/lib/vega/events";
import { forgetAllMemories, forgetMemory, listMemories, saveMemory, type VegaMemoryView } from "@/lib/vega/memory";
import { defaultAutonomy, type AutonomySettings } from "@/lib/vega/autonomy";
import { getVegaProfile, saveVegaProfile, type VegaProfile } from "@/lib/vega/profile";
import { deleteTask, listTasks, setTaskStatus, type VegaTaskView } from "@/lib/vega/tasks";
import { actionView, decideAction } from "@/lib/vega/decide";

export type VegaChatSummary = { id: string; title: string; updatedAt: string };
export type VegaAttachmentChip = { kind: "file" | "link"; name: string; url?: string };
export type VegaChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: VegaSource[];
  statuses?: string[];
  actions?: VegaActionView[];
  attachments?: VegaAttachmentChip[];
};

async function vegaUser() {
  const user = await getCurrentUser();
  return canUseVega(user) ? user : null;
}

export async function listVegaChats(): Promise<VegaChatSummary[]> {
  const user = await vegaUser();
  if (!user) return [];
  const chats = await getPrisma().vegaConversation.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, updatedAt: true },
  });
  return chats.map((chat) => ({ ...chat, updatedAt: chat.updatedAt.toISOString() }));
}

export async function openVegaChat(id: string): Promise<VegaChatMessage[] | null> {
  const user = await vegaUser();
  if (!user) return null;
  const chat = await getPrisma().vegaConversation.findFirst({
    where: { id, userId: user.id },
    select: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: 200,
        select: { id: true, role: true, content: true, meta: true },
      },
      actions: { select: { id: true, kind: true, payload: true, status: true, result: true } },
    },
  });
  if (!chat) return null;
  const actions = new Map(chat.actions.map((action) => [action.id, actionView(action)]));
  return chat.messages.map((message) => {
    const meta = (message.meta ?? {}) as { sources?: VegaSource[]; actions?: string[]; statuses?: string[] };
    const attachments = attachmentChips(message.meta);
    return {
      id: message.id,
      role: message.role === "user" ? "user" : "assistant",
      content: message.content,
      ...(attachments.length ? { attachments } : {}),
      ...(meta.sources?.length ? { sources: meta.sources } : {}),
      ...(meta.statuses?.length ? { statuses: meta.statuses } : {}),
      ...(meta.actions?.length
        ? { actions: meta.actions.map((actionId) => actions.get(actionId)).filter((item): item is VegaActionView => Boolean(item)) }
        : {}),
    };
  });
}

export async function renameVegaChat(id: string, title: string) {
  const user = await vegaUser();
  const clean = title.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!user || !clean) return { ok: false as const };
  const updated = await getPrisma().vegaConversation.updateMany({ where: { id, userId: user.id }, data: { title: clean } });
  return { ok: updated.count > 0 };
}

export async function deleteVegaChat(id: string) {
  const user = await vegaUser();
  if (!user) return { ok: false as const };
  const deleted = await getPrisma().vegaConversation.deleteMany({ where: { id, userId: user.id } });
  return { ok: deleted.count > 0 };
}

export async function myCredits() {
  const user = await getCurrentUser();
  return user ? currentCredits(user.id) : undefined;
}

export async function decideVegaAction(id: string, confirm: boolean): Promise<{ ok: boolean; action?: VegaActionView; message: string }> {
  const user = await vegaUser();
  if (!user) return { ok: false, message: "Vega está incluida en cualquier membresía activa." };
  return decideAction(user.id, id, confirm);
}

export async function vegaConnections() {
  const user = await vegaUser();
  if (!user || !composioConfigured()) return { available: false, connections: noConnections };
  const connections = await userConnections(user.id, true).catch(() => noConnections);
  return { available: true, connections };
}

export async function vegaMemories(): Promise<VegaMemoryView[]> {
  const user = await vegaUser();
  return user ? listMemories(user.id) : [];
}

export async function vegaProfile(): Promise<VegaProfile> {
  const user = await vegaUser();
  if (!user) return { business: null, goals: null, tone: null, markets: null, services: null, hours: null, team: null, notes: null };
  return getVegaProfile(user.id).catch(() => ({ business: null, goals: null, tone: null, markets: null, services: null, hours: null, team: null, notes: null }));
}

export async function updateVegaProfile(input: Partial<VegaProfile>): Promise<{ ok: boolean; error?: string }> {
  const user = await vegaUser();
  if (!user) return { ok: false, error: "Vega está incluida en cualquier membresía activa." };
  const saved = await saveVegaProfile(user.id, input);
  return saved.ok ? { ok: true } : { ok: false, error: saved.error };
}

export async function vegaAutonomy(): Promise<AutonomySettings> {
  const user = await vegaUser();
  if (!user) return defaultAutonomy;
  const prisma = getPrisma();
  const row = await prisma.vegaAutonomy.findUnique({ where: { userId: user.id } }).catch(() => null);
  if (!row) return defaultAutonomy;
  return {
    enabled: row.enabled,
    sendEmail: row.sendEmail,
    whatsapp: row.whatsapp,
    events: row.events,
    appActions: row.appActions,
    dailyLimit: row.dailyLimit,
  };
}

export async function updateVegaAutonomy(input: AutonomySettings): Promise<{ ok: boolean; error?: string }> {
  const user = await vegaUser();
  if (!user) return { ok: false, error: "Vega está incluida en cualquier membresía activa." };
  const limit = Math.max(1, Math.min(20, Math.floor(input.dailyLimit) || 5));
  await getPrisma().vegaAutonomy.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      enabled: input.enabled,
      sendEmail: input.sendEmail,
      whatsapp: input.whatsapp,
      events: input.events,
      appActions: input.appActions,
      dailyLimit: limit,
    },
    update: {
      enabled: input.enabled,
      sendEmail: input.sendEmail,
      whatsapp: input.whatsapp,
      events: input.events,
      appActions: input.appActions,
      dailyLimit: limit,
    },
  });
  return { ok: true };
}

export async function addVegaMemory(content: string) {
  const user = await vegaUser();
  if (!user) return { ok: false as const, error: "Vega está incluida en cualquier membresía activa." };
  return saveMemory(user.id, content);
}

export async function deleteVegaMemory(id: string) {
  const user = await vegaUser();
  return { ok: user ? await forgetMemory(user.id, id) : false };
}

export async function clearVegaMemories() {
  const user = await vegaUser();
  if (!user) return { ok: false as const, deleted: 0 };
  return { ok: true as const, deleted: await forgetAllMemories(user.id) };
}

export async function vegaTasks(): Promise<VegaTaskView[]> {
  const user = await vegaUser();
  return user ? listTasks(user.id) : [];
}

export async function toggleVegaTask(id: string, paused: boolean) {
  const user = await vegaUser();
  if (!user) return { ok: false as const };
  return { ok: await setTaskStatus(user.id, id, paused ? "paused" : "active") };
}

export async function deleteVegaTask(id: string) {
  const user = await vegaUser();
  if (!user) return { ok: false as const };
  return { ok: await deleteTask(user.id, id) };
}

export async function vegaWhatsapp() {
  const user = await vegaUser();
  if (!user) return null;
  const found = await getPrisma().user.findUnique({ where: { id: user.id }, select: { vegaWhatsapp: true } });
  return found?.vegaWhatsapp ?? null;
}

export async function saveVegaWhatsapp(phone: string | null) {
  const user = await vegaUser();
  if (!user) return { ok: false as const, error: "Vega está incluida en cualquier membresía activa." };
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (phone !== null && (digits.length < 10 || digits.length > 15)) {
    return { ok: false as const, error: "Escribe el número con código de país, p. ej. 52 55 1234 5678." };
  }
  await getPrisma().user.update({ where: { id: user.id }, data: { vegaWhatsapp: phone === null ? null : digits } });
  return { ok: true as const, phone: phone === null ? null : digits };
}

export async function connectVegaApp(toolkit: UserToolkit) {
  const user = await vegaUser();
  if (!user || !isUserToolkit(toolkit)) return { ok: false as const, error: "No disponible." };
  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || `https://${(await headers()).get("host")}`;
  forgetConnections(user.id);
  return userConnectUrl(user.id, toolkit, `${origin}/dashboard/super-agent?conexion=${toolkit}`);
}

export async function disconnectVegaApp(toolkit: UserToolkit) {
  const user = await vegaUser();
  if (!user || !isUserToolkit(toolkit)) return { ok: false as const };
  return { ok: await disconnectUser(user.id, toolkit) };
}
