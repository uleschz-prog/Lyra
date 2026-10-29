import { getPrisma } from "@/lib/prisma";
import { decryptWhatsappToken, encryptWhatsappToken, normalizePhone } from "@/lib/whatsapp/crypto";

const apiBase = "https://graph.facebook.com";

type GraphResult<T> = { ok: true; data: T } | { ok: false; error: string };
type MetaConnection = {
  id: string;
  userId: string;
  phoneNumberId: string;
  wabaId: string | null;
  businessId: string | null;
  displayPhoneNumber: string | null;
  accessTokenEncrypted: string | null;
  tokenExpiresAt: Date | null;
  status: string;
};

function graphVersion() {
  const version = process.env.META_GRAPH_API_VERSION?.trim() || "v26.0";
  if (!/^v\d+\.\d+$/.test(version)) throw new Error("META_GRAPH_API_VERSION debe tener el formato vNN.N.");
  return version;
}

function graphUrl(path: string) {
  return `${apiBase}/${graphVersion()}/${path.replace(/^\/+/, "")}`;
}

function errorText(value: unknown, fallback: string) {
  if (value && typeof value === "object") {
    const error = (value as { error?: unknown }).error;
    if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
      return (error as { message: string }).message.slice(0, 300);
    }
    if (typeof error === "string") return error.slice(0, 300);
  }
  return fallback;
}

async function graphRequest<T>(path: string, token: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<GraphResult<T>> {
  let response: Response;
  try {
    response = await fetch(graphUrl(path), {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "No pudimos comunicarnos con Meta. Intenta de nuevo." };
  }
  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || !payload) return { ok: false, error: errorText(payload, "Meta rechazó la solicitud.") };
  return { ok: true, data: payload };
}

function validAssetId(value: unknown): value is string {
  return typeof value === "string" && /^\d{5,40}$/.test(value);
}

export async function connectMetaWhatsapp(input: {
  userId: string;
  code: string;
  phoneNumberId: string;
  wabaId: string;
  businessId?: string;
}) {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) return { ok: false as const, error: "La conexión oficial de Meta todavía no está configurada en LYRA." };
  if (!input.code || input.code.length > 4096 || !validAssetId(input.phoneNumberId) || !validAssetId(input.wabaId)) {
    return { ok: false as const, error: "Meta devolvió datos de conexión incompletos." };
  }

  const prisma = getPrisma();
  const current = await prisma.whatsappConnection.findUnique({ where: { userId: input.userId } });
  if (current?.status === "active" && current.accessTokenEncrypted && current.phoneNumberId !== input.phoneNumberId) {
    return { ok: false as const, error: "Desconecta tu número actual antes de vincular otro." };
  }
  if (current?.status === "active" && !current.accessTokenEncrypted && current.phoneNumberId !== input.phoneNumberId) {
    const [chatCount, messageCount] = await Promise.all([
      prisma.whatsappChat.count({ where: { connectionId: current.id } }),
      prisma.whatsappMessage.count({ where: { connectionId: current.id } }),
    ]);
    if (chatCount || messageCount) {
      return { ok: false as const, error: "Hay conversaciones antiguas en la conexión. Desconéctala desde LYRA antes de vincular otro número; esto eliminará esos datos." };
    }
  }
  const owner = await prisma.whatsappConnection.findUnique({
    where: { phoneNumberId: input.phoneNumberId },
    select: { userId: true },
  });
  if (owner && owner.userId !== input.userId) {
    return { ok: false as const, error: "Ese número ya está vinculado a otra cuenta LYRA." };
  }

  const tokenUrl = new URL(graphUrl("oauth/access_token"));
  tokenUrl.searchParams.set("client_id", appId);
  tokenUrl.searchParams.set("client_secret", appSecret);
  tokenUrl.searchParams.set("code", input.code);
  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(tokenUrl, { cache: "no-store" });
  } catch {
    return { ok: false as const, error: "No pudimos completar la autorización con Meta." };
  }
  const tokenPayload = (await tokenResponse.json().catch(() => null)) as
    | { access_token?: unknown; expires_in?: unknown }
    | null;
  const accessToken = typeof tokenPayload?.access_token === "string" ? tokenPayload.access_token : "";
  if (!tokenResponse.ok || !accessToken) {
    return { ok: false as const, error: errorText(tokenPayload, "Meta no pudo validar la autorización.") };
  }

  const phone = await graphRequest<{ display_phone_number?: string }>(
    `${encodeURIComponent(input.phoneNumberId)}?fields=display_phone_number`,
    accessToken,
  );
  if (!phone.ok) return phone;

  const subscribed = await graphRequest<{ success?: boolean }>(
    `${encodeURIComponent(input.wabaId)}/subscribed_apps`,
    accessToken,
    "POST",
  );
  if (!subscribed.ok) {
    return { ok: false as const, error: `Meta autorizó el número pero no se pudo activar el webhook: ${subscribed.error}` };
  }

  const expiresIn = Number(tokenPayload?.expires_in);
  const tokenExpiresAt = Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null;
  let encryptedToken: string;
  try {
    encryptedToken = encryptWhatsappToken(accessToken);
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "No se pudo cifrar el token de WhatsApp.",
    };
  }
  try {
    const saved = await prisma.whatsappConnection.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        phoneNumberId: input.phoneNumberId,
        wabaId: input.wabaId,
        businessId: validAssetId(input.businessId) ? input.businessId : null,
        displayPhoneNumber: phone.data.display_phone_number ?? null,
        accessTokenEncrypted: encryptedToken,
        tokenExpiresAt,
        status: "active",
      },
      update: {
        phoneNumberId: input.phoneNumberId,
        wabaId: input.wabaId,
        businessId: validAssetId(input.businessId) ? input.businessId : null,
        displayPhoneNumber: phone.data.display_phone_number ?? null,
        accessTokenEncrypted: encryptedToken,
        tokenExpiresAt,
        status: "active",
        lastError: null,
      },
      select: { id: true },
    });
    return { ok: true as const, connectionId: saved.id, phone: phone.data.display_phone_number ?? "" };
  } catch {
    return { ok: false as const, error: "No pudimos guardar esta conexión. Verifica que el número no esté vinculado a otra cuenta." };
  }
}

export async function activeMetaConnection(userId: string) {
  const connection = await getPrisma().whatsappConnection.findFirst({
    where: { userId, status: "active", accessTokenEncrypted: { not: null } },
  });
  return connection;
}

function accessToken(connection: Pick<MetaConnection, "accessTokenEncrypted" | "tokenExpiresAt">) {
  if (!connection.accessTokenEncrypted) return { ok: false as const, error: "Vuelve a conectar WhatsApp Business con Meta." };
  if (connection.tokenExpiresAt && connection.tokenExpiresAt <= new Date()) {
    return { ok: false as const, error: "La autorización de Meta venció. Vuelve a conectar WhatsApp Business." };
  }
  try {
    return { ok: true as const, token: decryptWhatsappToken(connection.accessTokenEncrypted) };
  } catch {
    return { ok: false as const, error: "No se pudo descifrar la conexión. Contacta soporte de LYRA." };
  }
}

export type MetaWhatsappTemplate = {
  name: string;
  language: string;
  category: string;
  body: string;
  variables: number;
};

export async function listMetaWhatsappTemplates(userId: string) {
  const connection = await activeMetaConnection(userId);
  if (!connection?.wabaId) return { ok: false as const, error: "Conecta primero tu WhatsApp Business.", templates: [] as MetaWhatsappTemplate[] };
  const auth = accessToken(connection);
  if (!auth.ok) return { ok: false as const, error: auth.error, templates: [] as MetaWhatsappTemplate[] };
  const response = await graphRequest<{ data?: Record<string, unknown>[] }>(
    `${encodeURIComponent(connection.wabaId)}/message_templates?status=APPROVED&fields=name,language,category,components&limit=100`,
    auth.token,
  );
  if (!response.ok) return { ok: false as const, error: response.error, templates: [] as MetaWhatsappTemplate[] };
  const templates = (response.data.data ?? [])
    .filter((row) => typeof row.name === "string")
    .map((row) => {
      const components = Array.isArray(row.components) ? (row.components as Record<string, unknown>[]) : [];
      const body = String(components.find((component) => component.type === "BODY")?.text ?? "");
      return {
        name: String(row.name),
        language: String(row.language ?? "es_MX"),
        category: String(row.category ?? ""),
        body,
        variables: new Set(body.match(/\{\{\d+\}\}/g) ?? []).size,
      };
    });
  return { ok: true as const, templates };
}

export type BusinessMessage =
  | { text: string }
  | { template: string; language: string; variables: string[] };

export async function sendMetaWhatsapp(userId: string, phone: string, message: BusinessMessage) {
  const connection = await activeMetaConnection(userId);
  if (!connection) return { ok: false as const, error: "WhatsApp Business no está conectado." };
  const auth = accessToken(connection);
  if (!auth.ok) return auth;
  const to = normalizePhone(phone);
  if (to.length < 11 || to.length > 15) return { ok: false as const, error: "Número de destino inválido." };

  const payload = "text" in message
    ? {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: message.text.slice(0, 4096), preview_url: true },
      }
    : {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "template",
        template: {
          name: message.template,
          language: { code: message.language },
          ...(message.variables.length
            ? {
                components: [
                  {
                    type: "body",
                    parameters: message.variables.map((value) => ({ type: "text", text: value.slice(0, 900) })),
                  },
                ],
              }
            : {}),
        },
      };
  const sent = await graphRequest<{ messages?: { id?: string }[] }>(
    `${encodeURIComponent(connection.phoneNumberId)}/messages`,
    auth.token,
    "POST",
    payload,
  );
  return sent.ok
    ? { ok: true as const, waMessageId: sent.data.messages?.[0]?.id ?? null, phone: connection.displayPhoneNumber ?? "" }
    : sent;
}

export async function disconnectMetaWhatsapp(userId: string) {
  const connection = await getPrisma().whatsappConnection.findUnique({ where: { userId }, select: { id: true } });
  if (!connection) return true;
  await getPrisma().whatsappConnection.delete({ where: { id: connection.id } });
  return true;
}

export async function connectionView(userId: string) {
  const connection = await getPrisma().whatsappConnection.findUnique({
    where: { userId },
    select: { id: true, phoneNumberId: true, displayPhoneNumber: true, accessTokenEncrypted: true, status: true, tokenExpiresAt: true },
  });
  if (!connection || connection.status !== "active") return null;
  return {
    id: connection.id,
    phone: connection.displayPhoneNumber ?? "",
    needsReconnect: !connection.accessTokenEncrypted || Boolean(connection.tokenExpiresAt && connection.tokenExpiresAt <= new Date()),
  };
}
