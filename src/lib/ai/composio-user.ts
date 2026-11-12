import { composioConfigured } from "@/lib/ai/composio";
import { isUserToolkit, noConnections, toolkitLabels, type UserToolkit, type VegaConnections } from "@/lib/vega/apps";

export { toolkitLabels, type UserToolkit } from "@/lib/vega/apps";

const base = "https://backend.composio.dev/api/v3.1";

async function call(path: string, init?: RequestInit) {
  const key = process.env.COMPOSIO_API_KEY?.trim();
  if (!key) return null;
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { "x-api-key": key, "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as unknown;
    return { ok: response.ok, status: response.status, payload };
  } catch {
    // Red caída o Composio sin responder: nunca tumbar el turno de Vega.
    return { ok: false, status: 0, payload: { error: "Composio no respondió. Intenta en un momento." } };
  }
}

/** Errores de un servicio que significan «la conexión venció o se revocó». */
export function looksLikeExpiredAuth(status: number, message: string) {
  if (status === 401) return true;
  return /invalid_grant|unauthori[sz]ed|re-?auth|no autorizado|(token|credential|auth|session|grant|connection|conexi[oó]n|cuenta)[^.]{0,40}\b(expired|revoked|invalid|inactive|vencid|revocad)|\b(expired|revoked|invalid)\s+(access\s+)?(token|credentials?|grant|session)/i.test(message);
}

export type UserToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; /** El socio debe conectar (o volver a conectar) esta app. */ reconnect?: UserToolkit; expired?: boolean };

/** ¿Hay una cuenta de esta app del socio que venció o quedó inactiva? */
async function staleAccount(userId: string, toolkit: UserToolkit) {
  const listed = await call(`/connected_accounts?toolkit_slugs=${toolkit}&user_ids=${encodeURIComponent(userId)}&limit=10`);
  if (!listed?.ok) return false;
  return items(listed.payload).some(
    (item) =>
      (item.user_id === undefined || item.user_id === userId) &&
      typeof item.status === "string" &&
      ["EXPIRED", "INACTIVE", "FAILED"].includes(item.status.toUpperCase()),
  );
}

function items(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as { items?: unknown; data?: unknown };
  const list = Array.isArray(record.items) ? record.items : Array.isArray(record.data) ? record.data : [];
  return list.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
}

function errorText(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const record = payload as { error?: unknown; message?: unknown; data?: unknown };
    if (typeof record.error === "string" && record.error) return record.error;
    if (record.error && typeof record.error === "object") {
      const message = (record.error as { message?: unknown }).message;
      if (typeof message === "string" && message) return message;
    }
    if (typeof record.message === "string" && record.message) return record.message;
    if (record.data && typeof record.data === "object") {
      const message = (record.data as { message?: unknown }).message;
      if (typeof message === "string" && message) return message;
    }
  }
  return fallback;
}

const authConfigCache = new Map<UserToolkit, string>();

async function authConfigId(toolkit: UserToolkit) {
  const cached = authConfigCache.get(toolkit);
  if (cached) return cached;
  const listed = await call(`/auth_configs?toolkit_slug=${toolkit}&limit=10`);
  let id = items(listed?.payload).find((item) => typeof item.id === "string")?.id as string | undefined;
  if (!id) {
    const created = await call("/auth_configs", {
      method: "POST",
      body: JSON.stringify({
        toolkit: { slug: toolkit },
        auth_config: { type: "use_composio_managed_auth", name: `LYRA ${toolkitLabels[toolkit]}` },
      }),
    });
    const payload = created?.payload as { auth_config?: { id?: string }; id?: string } | null;
    id = payload?.auth_config?.id ?? payload?.id;
  }
  if (id) authConfigCache.set(toolkit, id);
  return id ?? null;
}

/** Cuenta ACTIVA del toolkit que pertenece a este usuario de LYRA. */
export async function userAccount(userId: string, toolkit: UserToolkit) {
  if (!composioConfigured()) return null;
  const listed = await call(
    `/connected_accounts?toolkit_slugs=${toolkit}&user_ids=${encodeURIComponent(userId)}&statuses=ACTIVE&limit=10`,
  );
  if (!listed?.ok) return null;
  const account = items(listed.payload).find(
    (item) =>
      typeof item.id === "string" &&
      item.status === "ACTIVE" &&
      (item.user_id === undefined || item.user_id === userId),
  );
  return (account?.id as string | undefined) ?? null;
}

const connectionCache = new Map<string, { at: number; value: VegaConnections }>();

export function forgetConnections(userId: string) {
  connectionCache.delete(userId);
}

function toolkitOf(item: Record<string, unknown>) {
  const toolkit = item.toolkit;
  if (toolkit && typeof toolkit === "object" && typeof (toolkit as { slug?: unknown }).slug === "string") {
    return (toolkit as { slug: string }).slug;
  }
  return typeof item.toolkit_slug === "string" ? item.toolkit_slug : "";
}

export async function userConnections(userId: string, fresh = false): Promise<VegaConnections> {
  const cached = connectionCache.get(userId);
  if (!fresh && cached && Date.now() - cached.at < 60_000) return cached.value;
  const listed = await call(`/connected_accounts?user_ids=${encodeURIComponent(userId)}&statuses=ACTIVE&limit=100`);
  const value = { ...noConnections };
  if (listed?.ok) {
    for (const item of items(listed.payload)) {
      const slug = toolkitOf(item).toLowerCase();
      if (item.status === "ACTIVE" && (item.user_id === undefined || item.user_id === userId) && isUserToolkit(slug)) {
        value[slug] = true;
      }
    }
  }
  connectionCache.set(userId, { at: Date.now(), value });
  return value;
}

/** Apps del socio cuya conexión venció o quedó inactiva (y no tienen otra cuenta activa). */
export async function userExpiredToolkits(userId: string, active: VegaConnections): Promise<UserToolkit[]> {
  const listed = await call(`/connected_accounts?user_ids=${encodeURIComponent(userId)}&limit=100`);
  if (!listed?.ok) return [];
  const expired = new Set<UserToolkit>();
  for (const item of items(listed.payload)) {
    const slug = toolkitOf(item).toLowerCase();
    const status = typeof item.status === "string" ? item.status.toUpperCase() : "";
    if (isUserToolkit(slug) && !active[slug] && (item.user_id === undefined || item.user_id === userId) && ["EXPIRED", "INACTIVE", "FAILED"].includes(status)) {
      expired.add(slug);
    }
  }
  return [...expired];
}

export async function userConnectUrl(userId: string, toolkit: UserToolkit, callbackUrl: string) {
  const authConfig = await authConfigId(toolkit);
  if (!authConfig) return { ok: false as const, error: "Composio no pudo preparar la conexión." };
  const linked = await call("/connected_accounts/link", {
    method: "POST",
    body: JSON.stringify({ auth_config_id: authConfig, user_id: userId, callback_url: callbackUrl }),
  });
  const url = (linked?.payload as { redirect_url?: string } | null)?.redirect_url;
  if (!linked?.ok || !url) return { ok: false as const, error: errorText(linked?.payload, "Composio no devolvió el enlace.") };
  return { ok: true as const, url };
}

export async function disconnectUser(userId: string, toolkit: UserToolkit) {
  forgetConnections(userId);
  const id = await userAccount(userId, toolkit);
  if (!id) return true;
  const removed = await call(`/connected_accounts/${id}`, { method: "DELETE" });
  return Boolean(removed?.ok);
}

export async function runUserTool(userId: string, toolkit: UserToolkit, tool: string, args: Record<string, unknown>): Promise<UserToolResult> {
  const label = toolkitLabels[toolkit];
  const accountId = await userAccount(userId, toolkit);
  if (!accountId) {
    if (!composioConfigured()) return { ok: false, error: "Composio no está configurado." };
    const expired = await staleAccount(userId, toolkit).catch(() => false);
    forgetConnections(userId);
    return expired
      ? { ok: false, error: `La conexión de ${label} venció. El socio debe volver a conectarla.`, reconnect: toolkit, expired: true }
      : { ok: false, error: `${label} no está conectado.`, reconnect: toolkit };
  }
  const result = await call(`/tools/execute/${tool}`, {
    method: "POST",
    body: JSON.stringify({ connected_account_id: accountId, user_id: userId, version: "latest", arguments: args }),
  });
  if (!result) return { ok: false, error: "Composio no está configurado." };
  const payload = result.payload as { successful?: boolean; data?: unknown } | null;
  if (!result.ok || payload?.successful === false) {
    const message = errorText(payload, `${label} no completó la acción.`);
    if (looksLikeExpiredAuth(result.status, message)) {
      forgetConnections(userId);
      return { ok: false, error: `La conexión de ${label} venció o se revocó. El socio debe volver a conectarla.`, reconnect: toolkit, expired: true };
    }
    return { ok: false, error: message };
  }
  return { ok: true, data: payload?.data };
}

/** Respuesta de error para el modelo; si la app necesita conexión, lo indica para mostrar la tarjeta. */
export function toolFailure(result: { error: string; reconnect?: UserToolkit; expired?: boolean }) {
  return {
    error: result.error,
    ...(result.reconnect ? { reconectar: result.reconnect, ...(result.expired ? { vencida: true } : {}) } : {}),
  };
}
