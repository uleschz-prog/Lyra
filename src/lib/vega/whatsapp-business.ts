import { getPrisma } from "@/lib/prisma";
import { activeMetaConnection, listMetaWhatsappTemplates, sendMetaWhatsapp } from "@/lib/whatsapp/meta-business";
import { normalizePhone } from "@/lib/whatsapp/crypto";

export { normalizePhone } from "@/lib/whatsapp/crypto";

export type WhatsappTemplate = {
  name: string;
  language: string;
  category: string;
  body: string;
  variables: number;
};

/** Número Meta conectado por el propio socio mediante Embedded Signup. */
export async function whatsappSender(userId: string) {
  const connection = await activeMetaConnection(userId);
  if (!connection) return { ok: false as const, error: "Conecta tu WhatsApp Business en LYRA." };
  if (!connection.displayPhoneNumber || !connection.wabaId) {
    return { ok: false as const, error: "La conexión de WhatsApp Business necesita autorización de nuevo." };
  }
  return {
    ok: true as const,
    sender: { id: connection.phoneNumberId, display: connection.displayPhoneNumber },
  };
}

export async function approvedTemplates(userId: string) {
  return listMetaWhatsappTemplates(userId);
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

export type BusinessMessage = { text: string } | { template: string; language: string; variables: string[] };

export async function sendBusinessWhatsapp(userId: string, to: string, message: BusinessMessage) {
  const phone = normalizePhone(to);
  if (!phone) return { ok: false as const, error: "Número de destino inválido." };
  const chat = await getPrisma().whatsappChat.findFirst({
    where: { userId, phone },
    select: { optedOutAt: true, lastInboundAt: true, consentAt: true },
  });
  if (!chat) return { ok: false as const, error: "Solo puedes escribir desde una conversación registrada en LYRA." };
  if (chat.optedOutAt || await isBlocked(userId, phone)) {
    return { ok: false as const, error: "Ese contacto pidió no recibir mensajes; está en tu lista de no molestar." };
  }
  if ("text" in message) {
    if (!chat.lastInboundAt || Date.now() - chat.lastInboundAt.getTime() >= 24 * 60 * 60_000) {
      return { ok: false as const, error: "Fuera de la ventana de 24 horas debes usar una plantilla aprobada y con consentimiento." };
    }
  } else {
    if (!chat.consentAt) return { ok: false as const, error: "No hay consentimiento registrado para enviar esta plantilla." };
    const templates = await listMetaWhatsappTemplates(userId);
    if (!templates.ok) return templates;
    const approved = templates.templates.find((template) => template.name === message.template && template.language === message.language);
    if (!approved || approved.variables !== message.variables.length) {
      return { ok: false as const, error: "La plantilla no está aprobada o el número de variables no coincide." };
    }
  }
  return sendMetaWhatsapp(userId, phone, message);
}
