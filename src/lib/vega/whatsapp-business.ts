import { runUserTool } from "@/lib/ai/composio-user";
import { getPrisma } from "@/lib/prisma";

export type WhatsappTemplate = { name: string; language: string; category: string; body: string; variables: number };

type Sender = { id: string; display: string };

const senderCache = new Map<string, { at: number; value: Sender }>();

/** Número de WhatsApp en dígitos con código de país; 10 dígitos se toman como México. */
export function normalizePhone(value: unknown) {
  let phone = typeof value === "string" ? value.replace(/\D/g, "") : "";
  if (phone.length === 10) phone = `52${phone}`;
  return phone.length >= 11 && phone.length <= 15 ? phone : "";
}

function records(data: unknown, depth = 0): Record<string, unknown>[] {
  if (!data || typeof data !== "object" || depth > 6) return [];
  if (Array.isArray(data)) {
    const rows = data.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
    if (rows.length && rows.some((row) => "id" in row || "name" in row)) return rows;
  }
  for (const value of Object.values(data as Record<string, unknown>)) {
    const found = records(value, depth + 1);
    if (found.length) return found;
  }
  return [];
}

/** Meta envía con el phone_number_id, nunca con el número visible. */
export async function whatsappSender(userId: string) {
  const cached = senderCache.get(userId);
  if (cached && Date.now() - cached.at < 10 * 60_000) return { ok: true as const, sender: cached.value };
  const listed = await runUserTool(userId, "whatsapp", "WHATSAPP_GET_PHONE_NUMBERS", { limit: 5 });
  if (!listed.ok) return { ok: false as const, error: listed.error };
  const row = records(listed.data).find((item) => typeof item.id === "string" && /^\d+$/.test(item.id));
  if (!row) return { ok: false as const, error: "Tu cuenta de WhatsApp Business no tiene un número registrado en Meta." };
  const sender = { id: String(row.id), display: typeof row.display_phone_number === "string" ? row.display_phone_number : "" };
  senderCache.set(userId, { at: Date.now(), value: sender });
  return { ok: true as const, sender };
}

export async function approvedTemplates(userId: string) {
  const listed = await runUserTool(userId, "whatsapp", "WHATSAPP_GET_MESSAGE_TEMPLATES", {
    status: "APPROVED",
    limit: 50,
    fields: "name,language,category,components",
  });
  if (!listed.ok) return { ok: false as const, error: listed.error };
  const templates: WhatsappTemplate[] = records(listed.data)
    .filter((item) => typeof item.name === "string")
    .map((item) => {
      const components = Array.isArray(item.components) ? (item.components as Record<string, unknown>[]) : [];
      const body = String(components.find((component) => component?.type === "BODY")?.text ?? "");
      return {
        name: String(item.name),
        language: String(item.language ?? "es_MX"),
        category: String(item.category ?? ""),
        body,
        variables: new Set(body.match(/\{\{\d+\}\}/g) ?? []).size,
      };
    });
  return { ok: true as const, templates };
}

export async function isBlocked(userId: string, phone: string) {
  const row = await getPrisma().vegaWhatsappBlock.findUnique({ where: { userId_phone: { userId, phone } }, select: { id: true } });
  return Boolean(row);
}

export async function blockPhone(userId: string, phone: string) {
  await getPrisma().vegaWhatsappBlock.upsert({ where: { userId_phone: { userId, phone } }, create: { userId, phone }, update: {} });
}

export async function unblockPhone(userId: string, phone: string) {
  await getPrisma().vegaWhatsappBlock.deleteMany({ where: { userId, phone } });
}

/** Meta rechaza variables de plantilla con saltos de línea, tabuladores o más de 4 espacios seguidos. */
function templateParam(value: string) {
  const flat = value.replace(/\s*\n+\s*/g, " · ").replace(/\s{2,}/g, " ").trim();
  return flat.length > 900 ? `${flat.slice(0, 899)}…` : flat;
}

export type BusinessMessage = { text: string } | { template: string; language: string; variables: string[] };

export async function sendBusinessWhatsapp(userId: string, to: string, message: BusinessMessage) {
  if (await isBlocked(userId, to)) return { ok: false as const, error: "Ese contacto pidió no recibir mensajes; está en tu lista de no molestar." };
  const found = await whatsappSender(userId);
  if (!found.ok) return found;
  const sent =
    "text" in message
      ? await runUserTool(userId, "whatsapp", "WHATSAPP_SEND_MESSAGE", {
          phone_number_id: found.sender.id,
          to_number: to,
          text: message.text.slice(0, 4096),
          preview_url: true,
        })
      : await runUserTool(userId, "whatsapp", "WHATSAPP_SEND_TEMPLATE_MESSAGE", {
          phone_number_id: found.sender.id,
          to_number: to,
          template_name: message.template,
          language_code: message.language,
          ...(message.variables.length
            ? { components: [{ type: "body", parameters: message.variables.map((value) => ({ type: "text", text: templateParam(value) })) }] }
            : {}),
        });
  return sent.ok ? { ok: true as const, from: found.sender.display } : { ok: false as const, error: sent.error };
}
