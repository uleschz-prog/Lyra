import { composioConfigured } from "@/lib/ai/composio";
import { isUserToolkit, noConnections, toolkitLabels, type UserToolkit, type VegaConnections } from "@/lib/vega/apps";

export { toolkitLabels, type UserToolkit } from "@/lib/vega/apps";

const base = "https://backend.composio.dev/api/v3.1";

async function call(path: string, init?: RequestInit) {
  const key = process.env.COMPOSIO_API_KEY?.trim();
  if (!key) return null;
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { "x-api-key": key, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  return { ok: response.ok, payload };
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

export async function runUserTool(userId: string, toolkit: UserToolkit, tool: string, args: Record<string, unknown>) {
  const accountId = await userAccount(userId, toolkit);
  if (!accountId) return { ok: false as const, error: `${toolkitLabels[toolkit]} no está conectado.` };
  const result = await call(`/tools/execute/${tool}`, {
    method: "POST",
    body: JSON.stringify({ connected_account_id: accountId, user_id: userId, version: "latest", arguments: args }),
  });
  if (!result) return { ok: false as const, error: "Composio no está configurado." };
  const payload = result.payload as { successful?: boolean; data?: unknown } | null;
  if (!result.ok || payload?.successful === false) {
    return { ok: false as const, error: errorText(payload, `${toolkitLabels[toolkit]} no completó la acción.`) };
  }
  return { ok: true as const, data: payload?.data };
}
