import { aiPricing } from "@/config/ai-pricing";
import { sendWhatsappText } from "@/lib/ai/composio";
import { aiJson, chargeAiCall, idempotencyKeyFrom, requireAiUser } from "@/lib/ai/guard";
import { whatsappDisabledMessage, whatsappSendPolicy } from "@/lib/ai/whatsapp-policy";
import { readCreditBalance } from "@/lib/credits/ledger";

export const maxDuration = 60;

function digits(value: string) {
  return value.replace(/\D/g, "");
}

export async function POST(request: Request) {
  const session = await requireAiUser();
  if (!session.user) return session.response;
  const user = session.user;

  const policy = whatsappSendPolicy(user.role, process.env.LYRA_WHATSAPP_ENABLED);
  if (!policy.allowed) {
    const balance = await readCreditBalance(user.id);
    const error =
      policy.reason === "admin"
        ? "Solo la cuenta administradora puede usar el WhatsApp compartido de LYRA."
        : whatsappDisabledMessage;
    return aiJson({ error, sent: false }, 403, balance);
  }

  const body = (await request.json().catch(() => null)) as {
    to?: unknown;
    text?: unknown;
    idempotencyKey?: unknown;
  } | null;

  const to = typeof body?.to === "string" ? digits(body.to) : "";
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 4000) : "";

  if (to.length < 8 || to.length > 15) {
    return aiJson({ error: "El destino de WhatsApp debe incluir el código de país." }, 400, user.credits);
  }

  if (!text) {
    return aiJson({ error: "Escribe el mensaje que quieres enviar." }, 400, user.credits);
  }

  const paid = await chargeAiCall({
    userId: user.id,
    cost: aiPricing.whatsapp,
    reason: "ai.whatsapp",
    description: `WhatsApp · ${to}`,
    idempotencyKey: idempotencyKeyFrom(request, body?.idempotencyKey),
    metadata: { to },
    execute: async () => {
      const result = await sendWhatsappText(to, text);
      if (!result.sent) throw new Error(result.error || "WhatsApp no aceptó el envío.");
      return result;
    },
  });

  if (!paid.ok) return aiJson({ error: paid.error, sent: false }, paid.status, paid.balance);
  return aiJson({ ...paid.value, charged: paid.charged, transaction: paid.transaction }, 200, paid.balance);
}
