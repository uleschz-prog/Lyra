const composioBase = "https://backend.composio.dev/api/v3.1";
const lyraUserId = "lyra";

type ComposioResult = {
  successful?: boolean;
  data?: unknown;
  error?: unknown;
};

function apiKey() {
  const key = process.env.COMPOSIO_API_KEY?.trim();
  return key ? key : null;
}

export function composioConfigured() {
  return apiKey() !== null;
}

async function composio(path: string, init?: RequestInit) {
  const key = apiKey();
  if (!key) return null;

  const response = await fetch(`${composioBase}${path}`, {
    ...init,
    headers: {
      "x-api-key": key,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  return { ok: response.ok, payload };
}

function itemsOf(payload: unknown) {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as { items?: unknown; data?: unknown };
  if (Array.isArray(record.items)) return record.items;
  if (Array.isArray(record.data)) return record.data;
  return [];
}

function messageOf(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as { error?: unknown; message?: unknown };
  if (typeof record.message === "string") return record.message;
  if (record.error && typeof record.error === "object" && typeof (record.error as { message?: unknown }).message === "string") {
    return (record.error as { message: string }).message;
  }
  if (typeof record.error === "string") return record.error;
  return "";
}

export async function activeWhatsappAccountId() {
  const listed = await composio("/connected_accounts?toolkit_slugs=whatsapp&limit=20");
  if (!listed) return { id: null, error: "Falta COMPOSIO_API_KEY." };
  if (!listed.ok) return { id: null, error: messageOf(listed.payload) || "Composio rechazó la clave del proyecto Lira." };

  for (const item of itemsOf(listed.payload)) {
    if (!item || typeof item !== "object") continue;
    const account = item as { id?: unknown; status?: unknown };
    if (typeof account.id === "string" && account.status === "ACTIVE") return { id: account.id, error: null };
  }

  return { id: null, error: null };
}

async function whatsappAuthConfigId() {
  const listed = await composio("/auth_configs?toolkit_slug=whatsapp&limit=10");
  for (const item of itemsOf(listed?.payload)) {
    if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") {
      return (item as { id: string }).id;
    }
  }

  const created = await composio("/auth_configs", {
    method: "POST",
    body: JSON.stringify({
      toolkit: { slug: "whatsapp" },
      auth_config: { type: "use_composio_managed_auth", name: "LYRA WhatsApp" },
    }),
  });
  const payload = created?.payload as { auth_config?: { id?: string }; id?: string } | null;
  return payload?.auth_config?.id ?? payload?.id ?? null;
}

export async function whatsappConnectUrl() {
  const authConfigId = await whatsappAuthConfigId();
  if (!authConfigId) return null;

  const linked = await composio("/connected_accounts/link", {
    method: "POST",
    body: JSON.stringify({
      auth_config_id: authConfigId,
      user_id: lyraUserId,
      alias: "lyra",
      experimental: {
        account_type: "SHARED",
        acl_config_for_shared: { allow_all_users: true },
      },
    }),
  });

  const redirect = linked?.payload as { redirect_url?: string } | null;
  if (linked?.ok && redirect?.redirect_url) return redirect.redirect_url;

  const retry = await composio("/connected_accounts/link", {
    method: "POST",
    body: JSON.stringify({
      auth_config_id: authConfigId,
      user_id: lyraUserId,
      alias: "lyra",
    }),
  });
  const second = retry?.payload as { redirect_url?: string } | null;
  return retry?.ok ? (second?.redirect_url ?? null) : null;
}

async function executeTool(accountId: string, tool: string, args: Record<string, unknown>) {
  const result = await composio(`/tools/execute/${tool}`, {
    method: "POST",
      body: JSON.stringify({
      connected_account_id: accountId,
      user_id: lyraUserId,
      version: "latest",
      arguments: args,
    }),
  });

  if (!result) return { ok: false as const, error: "Falta COMPOSIO_API_KEY." };
  const payload = result.payload as ComposioResult | null;
  const nestedError =
    payload && typeof payload.error === "string"
      ? payload.error
      : payload && typeof payload.data === "object" && payload.data && "message" in payload.data
        ? String((payload.data as { message?: unknown }).message ?? "")
        : "";

  if (!result.ok || payload?.successful === false) {
    return { ok: false as const, error: nestedError || "Composio no pudo completar el envío." };
  }

  return { ok: true as const, data: payload?.data };
}

async function senderPhoneNumberId(accountId: string) {
  const configured = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (configured) return configured;

  const listed = await executeTool(accountId, "WHATSAPP_GET_PHONE_NUMBERS", { limit: 5 });
  if (!listed.ok) return null;
  const rows = itemsOf(listed.data);
  const first = rows[0];
  if (first && typeof first === "object" && typeof (first as { id?: unknown }).id === "string") {
    return (first as { id: string }).id;
  }
  return null;
}

export async function sendWhatsappText(to: string, text: string) {
  if (!composioConfigured()) {
    return {
      sent: false as const,
      mode: "preview" as const,
      error: "Falta COMPOSIO_API_KEY en el servidor.",
    };
  }

  const account = await activeWhatsappAccountId();
  if (!account.id) {
    const connectUrl = account.error ? null : await whatsappConnectUrl();
    return {
      sent: false as const,
      mode: "disconnected" as const,
      error: account.error ?? "La clave de LYRA no ve la cuenta de WhatsApp. Conéctala en el proyecto Lira.",
      connectUrl,
    };
  }
  const accountId = account.id;

  const phoneNumberId = await senderPhoneNumberId(accountId);
  if (!phoneNumberId) {
    return {
      sent: false as const,
      mode: "disconnected" as const,
      error: "Composio no encontró el número de WhatsApp de LYRA.",
    };
  }

  const sent = await executeTool(accountId, "WHATSAPP_SEND_MESSAGE", {
    phone_number_id: phoneNumberId,
    to_number: to,
    text,
  });

  if (!sent.ok) {
    return { sent: false as const, mode: "error" as const, error: sent.error };
  }

  return { sent: true as const, mode: "sent" as const };
}
