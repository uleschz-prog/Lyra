import { maskChatId, redactToken } from "@/lib/telegram/parse";

type Fields = {
  userId?: string;
  connectionId?: string;
  chatId?: string | null;
  updateId?: number;
  messageId?: number | null;
  status?: string;
  errorCode?: string;
  durationMs?: number;
  [key: string]: unknown;
};

/** Log estructurado en una línea JSON. Nunca recibe tokens ni secretos; aun así se filtran por si acaso. */
export function logTelegram(event: string, fields: Fields = {}) {
  const { chatId, ...rest } = fields;
  const line = JSON.stringify({ scope: "telegram", event, ...rest, ...(chatId !== undefined ? { chatId: maskChatId(chatId) } : {}) });
  console.info(redactToken(line));
}
