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
import {
  activeMetaConnection,
  connectMetaWhatsapp,
  connectionView,
  disconnectMetaWhatsapp,
  listMetaWhatsappTemplates,
  sendMetaWhatsapp,
} from "@/lib/whatsapp/meta-business";

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
  if (!user) return { available: false, connections: noConnections };
  const connections = composioConfigured()
    ? await userConnections(user.id, true).catch(() => noConnections)
    : { ...noConnections };
  connections.whatsapp = Boolean(await connectionView(user.id));
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
  if (toolkit === "whatsapp") return { ok: true as const, url: "/dashboard/whatsapp" };
  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || `https://${(await headers()).get("host")}`;
  forgetConnections(user.id);
  return userConnectUrl(user.id, toolkit, `${origin}/dashboard/super-agent?conexion=${toolkit}`);
}

export async function disconnectVegaApp(toolkit: UserToolkit) {
  const user = await vegaUser();
  if (!user || !isUserToolkit(toolkit)) return { ok: false as const };
  if (toolkit === "whatsapp") return { ok: await disconnectMetaWhatsapp(user.id) };
  return { ok: await disconnectUser(user.id, toolkit) };
}

export async function completeMetaWhatsappSignup(input: {
  code: string;
  phoneNumberId?: unknown;
  wabaId?: unknown;
  businessId?: unknown;
}) {
  const user = await vegaUser();
  if (!user) return { ok: false as const, error: "Vega requiere una membresía activa." };
  if (typeof input.code !== "string" || typeof input.phoneNumberId !== "string" || typeof input.wabaId !== "string") {
    return { ok: false as const, error: "Meta no devolvió los datos necesarios para conectar el número." };
  }
  const result = await connectMetaWhatsapp({
    userId: user.id,
    code: input.code,
    phoneNumberId: input.phoneNumberId,
    wabaId: input.wabaId,
    businessId: typeof input.businessId === "string" ? input.businessId : undefined,
  });
  if (result.ok) forgetConnections(user.id);
  return result;
}

export async function whatsappDashboard() {
  const user = await vegaUser();
  if (!user) return null;
  const [connection, row] = await Promise.all([
    connectionView(user.id),
    getPrisma().whatsappConnection.findUnique({ where: { userId: user.id }, select: { instructions: true, automation: true } }),
  ]);
  if (!connection) return { connection: null, instructions: "", automation: false };
  return { connection, instructions: row?.instructions ?? "", automation: row?.automation ?? false };
}

export async function whatsappChats() {
  const user = await vegaUser();
  if (!user) return [];
  const connection = await activeMetaConnection(user.id);
  if (!connection) return [];
  const chats = await getPrisma().whatsappChat.findMany({
    where: { userId: user.id, connectionId: connection.id },
    orderBy: [{ lastInboundAt: "desc" }, { updatedAt: "desc" }],
    take: 100,
    select: {
      id: true,
      phone: true,
      name: true,
      stage: true,
      automation: true,
      optedOutAt: true,
      lastInboundAt: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { text: true, direction: true, createdAt: true } },
    },
  });
  return chats.map((chat) => ({
    ...chat,
    windowOpen: Boolean(chat.lastInboundAt && Date.now() - chat.lastInboundAt.getTime() < 24 * 60 * 60_000),
    lastInboundAt: chat.lastInboundAt?.toISOString() ?? null,
    messages: chat.messages.map((message) => ({ ...message, createdAt: message.createdAt.toISOString() })),
  }));
}

export async function whatsappChatMessages(chatId: string) {
  const user = await vegaUser();
  if (!user || typeof chatId !== "string") return [];
  const chat = await getPrisma().whatsappChat.findFirst({ where: { id: chatId, userId: user.id }, select: { id: true } });
  if (!chat) return [];
  const messages = await getPrisma().whatsappMessage.findMany({
    where: { userId: user.id, chatRowId: chat.id },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, direction: true, senderType: true, text: true, status: true, createdAt: true },
  });
  return messages.map((message) => ({ ...message, createdAt: message.createdAt.toISOString() }));
}

export async function setWhatsappChatAutomation(chatId: string, active: boolean) {
  const user = await vegaUser();
  if (!user) return { ok: false as const };
  const chat = await getPrisma().whatsappChat.findFirst({
    where: { id: chatId, userId: user.id },
    select: { id: true, optedOutAt: true },
  });
  if (!chat || (active && chat.optedOutAt)) return { ok: false as const };
  await getPrisma().whatsappChat.update({
    where: { id: chat.id },
    data: { automation: active ? "active" : "paused_by_human" },
  });
  return { ok: true as const };
}

export async function whatsappTemplates() {
  const user = await vegaUser();
  return user ? listMetaWhatsappTemplates(user.id) : { ok: false as const, error: "No disponible.", templates: [] };
}

type WhatsAppMessageInput = {
  chatId: string;
  text?: string;
  templateName?: string;
  language?: string;
  variables?: string[];
  scheduleAt?: string;
  consentConfirmed?: boolean;
};

export async function sendWhatsappFromInbox(input: WhatsAppMessageInput) {
  const user = await vegaUser();
  if (!user) return { ok: false as const, error: "Vega requiere una membresía activa." };
  const connection = await activeMetaConnection(user.id);
  if (!connection) return { ok: false as const, error: "Conecta primero tu WhatsApp Business." };
  const chat = await getPrisma().whatsappChat.findFirst({
    where: { id: input.chatId, userId: user.id, connectionId: connection.id },
    select: { id: true, phone: true, optedOutAt: true, lastInboundAt: true },
  });
  if (!chat) return { ok: false as const, error: "No encontramos esa conversación." };
  if (chat.optedOutAt || (await getPrisma().vegaWhatsappBlock.findUnique({ where: { userId_phone: { userId: user.id, phone: chat.phone } } }))) {
    return { ok: false as const, error: "Este contacto pidió no recibir mensajes. No se envió nada." };
  }

  const variables = Array.isArray(input.variables)
    ? input.variables.filter((value): value is string => typeof value === "string").slice(0, 20).map((value) => value.slice(0, 900))
    : [];
  const isTemplate = typeof input.templateName === "string" && input.templateName.length > 0;
  const text = typeof input.text === "string" ? input.text.trim().slice(0, 4096) : "";
  if (!isTemplate && !text) return { ok: false as const, error: "Escribe un mensaje." };

  const scheduledAt = input.scheduleAt ? new Date(input.scheduleAt) : null;
  if (input.scheduleAt && (!scheduledAt || !Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() + 60_000 || scheduledAt.getTime() > Date.now() + 90 * 86_400_000)) {
    return { ok: false as const, error: "Elige una fecha futura dentro de los próximos 90 días." };
  }
  if ((scheduledAt || isTemplate) && input.consentConfirmed !== true) {
    return { ok: false as const, error: "Confirma que el contacto aceptó recibir este mensaje." };
  }
  if (!isTemplate) {
    const deliveryAt = scheduledAt ?? new Date();
    if (!chat.lastInboundAt || deliveryAt.getTime() - chat.lastInboundAt.getTime() > 24 * 60 * 60_000) {
      return { ok: false as const, error: "Fuera de la ventana de 24 horas Meta requiere una plantilla aprobada y consentimiento." };
    }
  }

  let message: { text: string } | { template: string; language: string; variables: string[] };
  let templateMessage: { template: string; language: string; variables: string[] } | null = null;
  if (isTemplate) {
    const templates = await listMetaWhatsappTemplates(user.id);
    if (!templates.ok) return templates;
    const selected = templates.templates.find((template) => template.name === input.templateName && template.language === input.language);
    if (!selected) return { ok: false as const, error: "Selecciona una plantilla aprobada vigente de Meta." };
    if (selected.variables !== variables.length) {
      return { ok: false as const, error: `La plantilla necesita ${selected.variables} variable(s).` };
    }
    templateMessage = { template: selected.name, language: selected.language, variables };
    message = templateMessage;
  } else {
    message = { text };
  }

  if (input.consentConfirmed === true) {
    await getPrisma().whatsappChat.update({
      where: { id: chat.id },
      data: { consentAt: new Date(), consentSource: "dashboard_user_confirmation" },
    });
  }

  if (scheduledAt) {
    const scheduled = await getPrisma().whatsappScheduledMessage.create({
      data: {
        userId: user.id,
        connectionId: connection.id,
        chatRowId: chat.id,
        recipientPhone: chat.phone,
        kind: isTemplate ? "template" : "text",
        text: isTemplate ? null : text,
        templateName: templateMessage?.template ?? null,
        language: templateMessage?.language ?? null,
        variables: templateMessage ? templateMessage.variables : undefined,
        consentConfirmed: input.consentConfirmed === true,
        runAt: scheduledAt,
      },
      select: { id: true, runAt: true },
    });
    return { ok: true as const, scheduled: true, id: scheduled.id, runAt: scheduled.runAt.toISOString() };
  }

  const sent = await sendMetaWhatsapp(user.id, chat.phone, message);
  const saved = await getPrisma().whatsappMessage.create({
    data: {
      userId: user.id,
      connectionId: connection.id,
      chatRowId: chat.id,
      waMessageId: sent.ok ? sent.waMessageId : null,
      direction: "outbound",
      senderType: "human",
      text: templateMessage ? `[Plantilla ${templateMessage.template}] ${variables.join(" · ")}` : text,
      status: sent.ok ? "sent" : "failed",
      error: sent.ok ? null : sent.error,
    },
    select: { id: true, direction: true, senderType: true, text: true, status: true, createdAt: true },
  });
  return sent.ok
    ? { ok: true as const, scheduled: false, message: { ...saved, createdAt: saved.createdAt.toISOString() } }
    : { ok: false as const, error: sent.error };
}

export async function cancelWhatsappSchedule(id: string) {
  const user = await vegaUser();
  if (!user) return { ok: false as const };
  const changed = await getPrisma().whatsappScheduledMessage.updateMany({
    where: { id, userId: user.id, status: "scheduled" },
    data: { status: "cancelled" },
  });
  return { ok: changed.count > 0 };
}

export async function whatsappSchedules() {
  const user = await vegaUser();
  if (!user) return [];
  const rows = await getPrisma().whatsappScheduledMessage.findMany({
    where: { userId: user.id, status: { in: ["scheduled", "failed"] } },
    orderBy: { runAt: "asc" },
    take: 100,
    select: { id: true, chatRowId: true, recipientPhone: true, kind: true, text: true, templateName: true, runAt: true, status: true, error: true },
  });
  return rows.map((row) => ({ ...row, runAt: row.runAt.toISOString() }));
}

export async function saveWhatsappSettings(input: { instructions: string; automation: boolean }) {
  const user = await vegaUser();
  if (!user) return { ok: false as const, error: "No disponible." };
  const connection = await activeMetaConnection(user.id);
  if (!connection) return { ok: false as const, error: "Conecta primero tu WhatsApp Business." };
  await getPrisma().whatsappConnection.update({
    where: { id: connection.id },
    data: { instructions: input.instructions.trim().slice(0, 4000), automation: input.automation },
  });
  return { ok: true as const };
}

export async function disconnectWhatsappBusiness() {
  const user = await vegaUser();
  if (!user) return { ok: false as const };
  await disconnectMetaWhatsapp(user.id);
  forgetConnections(user.id);
  return { ok: true as const };
}
