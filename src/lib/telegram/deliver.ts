import { getPrisma } from "@/lib/prisma";
import type { TelegramClient } from "@/lib/telegram/client";
import { logTelegram } from "@/lib/telegram/log";

export type ChatRef = { id: string; chatId: string; userId: string; connectionId: string };

/** Envía texto plano a un chat del socio, registra el mensaje y marca bloqueos. */
export async function sendToChat(
  client: TelegramClient,
  chat: ChatRef,
  text: string,
  senderType: "agent" | "human" | "system",
  options: { replyTo?: number; buttons?: { text: string; data?: string; url?: string }[][] } = {},
) {
  const prisma = getPrisma();
  const sent = await client.sendText(chat.chatId, text, options);
  await prisma.telegramMessage.create({
    data: {
      userId: chat.userId,
      connectionId: chat.connectionId,
      chatRowId: chat.id,
      direction: "outbound",
      senderType,
      text: text.slice(0, 8000),
      tgMessageId: sent.ok ? BigInt(sent.result.messageIds[0]) : null,
      status: sent.ok ? "sent" : "failed",
      error: sent.ok ? null : sent.error,
    },
  });
  if (sent.ok) {
    await prisma.telegramChat.update({ where: { id: chat.id }, data: { lastOutboundAt: new Date() } });
  } else if (sent.code === "blocked" || sent.code === "chat_not_found") {
    await prisma.telegramChat.update({ where: { id: chat.id }, data: { isBlocked: true } });
    await prisma.telegramFollowup.updateMany({ where: { chatRowId: chat.id, status: "scheduled" }, data: { status: "cancelled", lastError: sent.error } });
  }
  logTelegram("outbound", { userId: chat.userId, connectionId: chat.connectionId, chatId: chat.chatId, status: sent.ok ? "sent" : "failed", errorCode: sent.ok ? undefined : sent.code, senderType });
  return sent;
}

/** Aviso al socio en su chat vinculado con el bot. */
export async function notifyOwner(client: TelegramClient, ownerChatId: string | null, text: string) {
  if (!ownerChatId) return false;
  const sent = await client.sendText(ownerChatId, text);
  return sent.ok;
}
