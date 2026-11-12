import { higgsfieldApiBase, higgsfieldAuthHeaders, higgsfieldPublicError } from "@/lib/ai/higgsfield-api";

export type SoulReference = {
  id: string;
  name: string;
  status: string;
  model_version: string | null;
};

function referenceId(value: unknown) {
  return typeof value === "string" && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)
    ? value
    : null;
}

function normalizeReference(value: unknown): SoulReference | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = referenceId(record.id);
  if (!id || typeof record.status !== "string") return null;
  return {
    id,
    name: typeof record.name === "string" ? record.name.slice(0, 120) : "Soul ID",
    status: record.status.slice(0, 40),
    model_version: typeof record.model_version === "string" ? record.model_version.slice(0, 20) : null,
  };
}

async function providerJson(url: URL, init?: RequestInit) {
  const auth = higgsfieldAuthHeaders();
  if (!auth) return { ok: false as const, status: 503, error: "Higgsfield no está configurado en el servidor." };

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { ...auth, ...(init?.headers ?? {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { ok: false as const, status: 502, error: "No se pudo contactar a Higgsfield." };
  }
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    return {
      ok: false as const,
      status: response.status >= 500 ? 502 : response.status,
      error: higgsfieldPublicError(response.status, payload, "Higgsfield rechazó la operación de Soul ID."),
    };
  }
  return { ok: true as const, payload };
}

export async function listSoulReferences() {
  const url = new URL("/v1/custom-references/list", higgsfieldApiBase);
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "100");
  const result = await providerJson(url);
  if (!result.ok) return result;

  const payload = result.payload;
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.data)
      ? record.data
      : Array.isArray(record?.references)
        ? record.references
        : null;
  if (!items) return { ok: false as const, status: 502, error: "Higgsfield devolvió una lista de Soul ID inválida." };

  return {
    ok: true as const,
    references: items.map(normalizeReference).filter((item): item is SoulReference => item !== null),
  };
}

export async function createSoulReference(name: string, imageUrls: string[]) {
  const url = new URL("/v1/custom-references", higgsfieldApiBase);
  const result = await providerJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      model_version: "v2",
      input_images: imageUrls.map((imageUrl) => ({ type: "image_url", image_url: imageUrl })),
    }),
  });
  if (!result.ok) return result;
  const payload = result.payload;
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const reference = normalizeReference(record?.reference ?? payload);
  if (!reference) {
    return { ok: false as const, status: 502, error: "Higgsfield no devolvió los datos esperados del Soul ID." };
  }
  return { ok: true as const, reference };
}

export async function getSoulReference(id: string) {
  const url = new URL(`/v1/custom-references/${encodeURIComponent(id)}`, higgsfieldApiBase);
  const result = await providerJson(url);
  if (!result.ok) return result;
  const payload = result.payload;
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const reference = normalizeReference(record?.reference ?? payload);
  if (!reference) {
    return { ok: false as const, status: 502, error: "Higgsfield devolvió un estado de Soul ID inválido." };
  }
  return { ok: true as const, reference };
}

export function parseSoulReferenceInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (name.length < 1 || name.length > 120 || !Array.isArray(record.image_urls)) return null;

  const rawUrls = record.image_urls;
  if (rawUrls.length < 1 || rawUrls.length > 100) return null;
  const imageUrls: string[] = [];
  for (const rawUrl of rawUrls) {
    if (typeof rawUrl !== "string" || rawUrl.length > 2048) return null;
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
      imageUrls.push(url.toString());
    } catch {
      return null;
    }
  }
  if (new Set(imageUrls).size !== imageUrls.length) return null;
  return { name, imageUrls };
}

export function parseSoulReferenceId(value: unknown) {
  return referenceId(value);
}
