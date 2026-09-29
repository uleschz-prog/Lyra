import { normalizePhone } from "@/lib/whatsapp/crypto";
import { WHATSAPP_TEXT_LIMIT } from "@/lib/whatsapp/parse";

const GRAPH_VERSION = "v21.0";

type SendResult = { ok: true; waMessageId: string | null } | { ok: false; error: string };

function configError() {
  if (!process.env.WHATSAPP_ACCESS_TOKEN) return "Falta WHATSAPP_ACCESS_TOKEN en el servidor.";
  return null;
}

/** Envía texto libre por WhatsApp Cloud API. El número va en dígitos con código de país. */
export async function sendWhatsappText(phoneNumberId: string, to: string, text: string): Promise<SendResult> {
  const missing = configError();
  if (missing) return { ok: false, error: missing };
  const target = normalizePhone(to);
  if (!target) return { ok: false, error: "Número de destino inválido." };
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: target, text: { body: text.slice(0, 4096), preview_url: true } }),
  }).catch(() => null);
  if (!response || !response.ok) {
    const detail = response ? await response.text().catch(() => "") : "";
    return { ok: false, error: detail.slice(0, 300) || "WhatsApp no respondió." };
  }
  const payload = (await response.json().catch(() => null)) as { messages?: { id?: string }[] } | null;
  return { ok: true, waMessageId: payload?.messages?.[0]?.id ?? null };
}

/** Divide un texto largo en burbujas de hasta 4096 caracteres. */
export function splitWhatsappText(text: string, limit = WHATSAPP_TEXT_LIMIT) {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(" "));
    const at = cut > limit * 0.5 ? cut : limit;
    chunks.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}
