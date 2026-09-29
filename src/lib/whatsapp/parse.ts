export const WHATSAPP_TEXT_LIMIT = 4096;

export type WhatsappInbound = {
  waMessageId: string;
  phoneNumberId: string;
  from: string;
  name: string | null;
  text: string;
  hasMedia: boolean;
};

type Json = Record<string, unknown>;

const record = (value: unknown): Json | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null);
const str = (value: unknown, max = 256) => (typeof value === "string" ? value.slice(0, max) : undefined);
const digits = (value: unknown) => (typeof value === "string" ? value.replace(/\D/g, "").slice(0, 16) : "");

type WhatsappStatus = { waMessageId: string; phoneNumberId: string; status: string };

/** Extrae los mensajes de texto entrantes y los estados de entrega de un webhook de Meta. */
export function parseMetaWebhook(raw: unknown): { messages: WhatsappInbound[]; statuses: WhatsappStatus[] } {
  const out = { messages: [] as WhatsappInbound[], statuses: [] as WhatsappStatus[] };
  const body = record(raw);
  if (!body) return out;
  const entries = Array.isArray(body.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(record(entry)?.changes) ? (record(entry)!.changes as unknown[]) : [];
    for (const change of changes) {
      const value = record(record(change)?.value);
      if (!value) continue;
      const phoneNumberId = str(record(value.metadata)?.phone_number_id, 40);
      if (!phoneNumberId) continue;
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const item of messages) {
        const message = record(item);
        const waMessageId = str(message?.id, 64);
        const from = digits(message?.from);
        if (!message || !waMessageId || !from) continue;
        const contact = record(Array.isArray(value.contacts) ? value.contacts[0] : null);
        const name = str(record(contact?.profile)?.name, 128) ?? null;
        const textRecord = record(message.text);
        const text = (str(textRecord?.body, WHATSAPP_TEXT_LIMIT) ?? str(message?.caption, 1024) ?? "").trim();
        const hasMedia = ["image", "video", "voice", "audio", "document", "sticker", "location", "contacts"].some(
          (key) => key in message,
        );
        out.messages.push({ waMessageId, phoneNumberId, from, name, text, hasMedia });
      }
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const item of statuses) {
        const row = record(item);
        const waMessageId = str(row?.id, 64);
        const status = str(row?.status, 20);
        if (!row || !waMessageId || !status) continue;
        out.statuses.push({ waMessageId, phoneNumberId, status });
      }
    }
  }
  return out;
}

const stopWords =
  /^(stop|baja|cancelar|unsubscribe|no me escribas( más| mas)?|ya no (me )?escribas|no quiero (recibir )?(más |mas )?mensajes)[\s.!]*$/i;

export function isWhatsappOptOut(text: string) {
  return stopWords.test(text.trim());
}
