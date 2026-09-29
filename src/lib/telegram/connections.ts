import { Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/prisma";
import { TelegramClient, telegramUserError, type FetchLike } from "@/lib/telegram/client";
import { decryptSecret, encryptionConfigured, encryptSecret, randomSecret, sha256 } from "@/lib/telegram/crypto";
import { tokenPattern } from "@/lib/telegram/parse";
import { logTelegram } from "@/lib/telegram/log";

export type TelegramStatus = "pending" | "active" | "paused" | "error" | "disconnected";

export type TelegramConnectionView = {
  id: string;
  botId: string;
  botUsername: string;
  botName: string;
  status: TelegramStatus;
  automation: boolean;
  followups: boolean;
  instructions: string;
  ownerLinked: boolean;
  createdAt: string;
  lastVerifiedAt: string | null;
  lastWebhookAt: string | null;
  lastError: string | null;
};

const viewSelect = {
  id: true,
  botId: true,
  botUsername: true,
  botName: true,
  status: true,
  automation: true,
  followups: true,
  instructions: true,
  ownerChatId: true,
  createdAt: true,
  lastVerifiedAt: true,
  lastWebhookAt: true,
  lastError: true,
} satisfies Prisma.TelegramConnectionSelect;

type ViewRow = Prisma.TelegramConnectionGetPayload<{ select: typeof viewSelect }>;

export function connectionView(row: ViewRow): TelegramConnectionView {
  return {
    id: row.id,
    botId: row.botId,
    botUsername: row.botUsername,
    botName: row.botName,
    status: row.status as TelegramStatus,
    automation: row.automation,
    followups: row.followups,
    instructions: row.instructions,
    ownerLinked: Boolean(row.ownerChatId),
    createdAt: row.createdAt.toISOString(),
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    lastWebhookAt: row.lastWebhookAt?.toISOString() ?? null,
    lastError: row.lastError,
  };
}

export function webhookBase(origin?: string) {
  return (process.env.TELEGRAM_WEBHOOK_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || origin || "").replace(/\/+$/, "");
}

export async function getConnection(userId: string) {
  const row = await getPrisma().telegramConnection.findUnique({ where: { userId }, select: viewSelect });
  return row && row.status !== "disconnected" ? connectionView(row) : null;
}

/** Cliente de Telegram de una conexión, siempre acotado al socio dueño. */
export async function clientFor(connectionId: string, userId: string, fetchImpl?: FetchLike) {
  const row = await getPrisma().telegramConnection.findFirst({
    where: { id: connectionId, userId, status: { not: "disconnected" } },
    select: { tokenEnc: true },
  });
  if (!row) return null;
  return new TelegramClient(decryptSecret(row.tokenEnc), fetchImpl);
}

export async function connectBot(userId: string, rawToken: string, origin: string, fetchImpl?: FetchLike) {
  const token = rawToken.trim();
  if (!encryptionConfigured()) return { ok: false as const, error: "Telegram aún no está habilitado en el servidor. Avisa al administrador." };
  if (!tokenPattern.test(token)) return { ok: false as const, error: "Ese texto no parece un token de BotFather. Debe verse como 123456789:ABC…" };
  const base = webhookBase(origin);
  if (!base.startsWith("https://")) return { ok: false as const, error: "El webhook necesita una URL pública con https." };

  const client = new TelegramClient(token, fetchImpl);
  const me = await client.getMe();
  if (!me.ok) return { ok: false as const, error: me.error };
  if (!me.result.is_bot || !me.result.username) return { ok: false as const, error: "Ese token no pertenece a un bot." };

  const prisma = getPrisma();
  const tokenHash = sha256(token);
  const botId = String(me.result.id);
  const taken = await prisma.telegramConnection.findFirst({
    where: { OR: [{ botId }, { tokenHash }], NOT: { userId } },
    select: { status: true },
  });
  if (taken && taken.status !== "disconnected") return { ok: false as const, error: "Ese bot ya está conectado a otra cuenta de LYRA." };
  if (taken) await prisma.telegramConnection.deleteMany({ where: { OR: [{ botId }, { tokenHash }], NOT: { userId } } });

  const secret = randomSecret();
  const data = {
    botId,
    botUsername: me.result.username,
    botName: me.result.first_name.slice(0, 120),
    tokenEnc: encryptSecret(token),
    tokenHash,
    secretHash: sha256(secret),
    status: "pending",
    lastError: null,
    disconnectedAt: null,
  };
  const row = await prisma.telegramConnection.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
    select: { id: true },
  });

  const hooked = await client.setWebhook(`${base}/api/telegram/webhook/${row.id}`, secret);
  const now = new Date();
  const saved = await prisma.telegramConnection.update({
    where: { id: row.id },
    data: hooked.ok
      ? { status: "active", lastVerifiedAt: now, lastError: null }
      : { status: "error", lastError: hooked.error },
    select: viewSelect,
  });
  logTelegram("connect", { userId, connectionId: row.id, status: saved.status, errorCode: hooked.ok ? undefined : hooked.code });
  return hooked.ok
    ? { ok: true as const, connection: connectionView(saved) }
    : { ok: false as const, error: `No se pudo configurar el webhook: ${hooked.error}`, connection: connectionView(saved) };
}

export async function verifyConnection(userId: string, fetchImpl?: FetchLike) {
  const prisma = getPrisma();
  const row = await prisma.telegramConnection.findUnique({ where: { userId }, select: { id: true, status: true, tokenEnc: true } });
  if (!row || row.status === "disconnected") return { ok: false as const, error: "No tienes un bot conectado." };
  const client = new TelegramClient(decryptSecret(row.tokenEnc), fetchImpl);
  const me = await client.getMe();
  if (!me.ok) {
    const saved = await prisma.telegramConnection.update({ where: { id: row.id }, data: { status: "error", lastError: me.error }, select: viewSelect });
    return { ok: false as const, error: me.error, connection: connectionView(saved) };
  }
  const info = await client.getWebhookInfo();
  const expected = `/api/telegram/webhook/${row.id}`;
  let problem: string | null = null;
  if (!info.ok) problem = info.error;
  else if (!info.result.url.endsWith(expected)) problem = "El webhook del bot apunta a otro servicio. Vuelve a conectar el token para recuperarlo.";
  else if (info.result.last_error_message && info.result.last_error_date && Date.now() / 1000 - info.result.last_error_date < 3600) {
    problem = `Telegram reportó: ${info.result.last_error_message.slice(0, 160)}`;
  }
  const saved = await prisma.telegramConnection.update({
    where: { id: row.id },
    data: {
      botUsername: me.result.username ?? undefined,
      botName: me.result.first_name.slice(0, 120),
      lastVerifiedAt: new Date(),
      lastError: problem,
      status: problem ? "error" : row.status === "paused" ? "paused" : "active",
    },
    select: viewSelect,
  });
  return problem ? { ok: false as const, error: problem, connection: connectionView(saved) } : { ok: true as const, connection: connectionView(saved) };
}

export async function disconnectBot(userId: string, fetchImpl?: FetchLike) {
  const prisma = getPrisma();
  const row = await prisma.telegramConnection.findUnique({ where: { userId }, select: { id: true, tokenEnc: true } });
  if (!row) return { ok: true as const };
  try {
    await new TelegramClient(decryptSecret(row.tokenEnc), fetchImpl).deleteWebhook();
  } catch {
    // El token puede haberse revocado; la conexión se cierra igual.
  }
  await prisma.$transaction([
    prisma.telegramFollowup.updateMany({ where: { connectionId: row.id, status: "scheduled" }, data: { status: "cancelled", lastError: "Bot desconectado." } }),
    prisma.telegramConnection.update({
      where: { id: row.id },
      data: {
        status: "disconnected",
        disconnectedAt: new Date(),
        tokenEnc: "",
        tokenHash: `revoked:${row.id}`,
        secretHash: "",
        ownerChatId: null,
        ownerLinkCode: null,
      },
    }),
  ]);
  logTelegram("disconnect", { userId, connectionId: row.id });
  return { ok: true as const };
}

export async function updateSettings(
  userId: string,
  input: { automation?: boolean; followups?: boolean; instructions?: string; paused?: boolean },
) {
  const prisma = getPrisma();
  const row = await prisma.telegramConnection.findUnique({ where: { userId }, select: { id: true, status: true } });
  if (!row || row.status === "disconnected") return null;
  const data: Prisma.TelegramConnectionUpdateInput = {};
  if (typeof input.automation === "boolean") data.automation = input.automation;
  if (typeof input.followups === "boolean") data.followups = input.followups;
  if (typeof input.instructions === "string") data.instructions = input.instructions.trim().slice(0, 4000);
  if (input.paused === true) data.status = "paused";
  if (input.paused === false && row.status === "paused") data.status = "active";
  await prisma.telegramConnection.update({ where: { id: row.id }, data });
  return getConnection(userId);
}

export async function ownerLink(userId: string) {
  const prisma = getPrisma();
  const row = await prisma.telegramConnection.findUnique({ where: { userId }, select: { id: true, botUsername: true, status: true } });
  if (!row || row.status === "disconnected") return null;
  const code = `owner_${randomSecret(18)}`.slice(0, 64);
  await prisma.telegramConnection.update({ where: { id: row.id }, data: { ownerLinkCode: code } });
  return `https://t.me/${row.botUsername}?start=${code}`;
}

export function telegramErrorText(code: Parameters<typeof telegramUserError>[0]) {
  return telegramUserError(code);
}
