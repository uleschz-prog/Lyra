import { providerError, readJson } from "@/lib/ai/providers";

export type HiggsfieldVideoModel = "wan-3.0" | "wan-3.0-prime";

const apiBase = "https://api.higgsfield.ai";
const endpointIds: Record<HiggsfieldVideoModel, string> = {
  "wan-3.0": "alibaba/wan-3.0/text-to-video",
  "wan-3.0-prime": "alibaba/wan-3.0-prime/text-to-video",
};

type VideoRequest = {
  prompt: string;
  duration: number;
  aspect_ratio: string;
  resolution: "480p";
  generate_audio: true;
};

export type HiggsfieldSubmission = { requestId: string; statusUrl: string };
export type HiggsfieldStatus =
  | { ok: true; status: string; videoUrl?: string }
  | { ok: false; error: string };

function credentials() {
  const keyId = process.env.HIGGSFIELD_API_KEY_ID?.trim() ?? "";
  const keySecret = process.env.HIGGSFIELD_API_KEY_SECRET?.trim() ?? "";
  if (!keyId || !keySecret) return null;
  return { Authorization: `Key ${keyId}:${keySecret}` };
}

function endpoint(model: HiggsfieldVideoModel) {
  return `${apiBase}/${endpointIds[model]}`;
}

function requestBody(input: Omit<VideoRequest, "resolution" | "generate_audio">): VideoRequest {
  return { ...input, resolution: "480p", generate_audio: true };
}

export function isHiggsfieldVideoModel(value: unknown): value is HiggsfieldVideoModel {
  return value === "wan-3.0" || value === "wan-3.0-prime";
}

export function higgsfieldVideoSegmentDurations(durationSeconds: number) {
  const result: number[] = [];
  let remaining = durationSeconds;
  while (remaining > 0) {
    const segment = Math.min(30, remaining);
    if (segment < 2) throw new Error("Cada segmento debe durar al menos 2 segundos.");
    result.push(segment);
    remaining -= segment;
  }
  return result;
}

export async function estimateHiggsfieldVideo(input: {
  model: HiggsfieldVideoModel;
  prompts: string[];
  durations: number[];
  aspectRatio: string;
}): Promise<{ ok: true; costUsd: number } | { ok: false; error: string }> {
  const auth = credentials();
  if (!auth) return { ok: false, error: "Higgsfield no está configurado en el servidor." };

  let costUsd = 0;
  for (const [index, duration] of input.durations.entries()) {
    const response = await fetch(`${apiBase}/estimate/${endpointIds[input.model]}`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify(
        requestBody({
          prompt: (input.prompts[index] ?? input.prompts[0] ?? "Video").slice(0, 1000),
          duration,
          aspect_ratio: input.aspectRatio,
        }),
      ),
      cache: "no-store",
    });
    const payload = await readJson(response);
    const estimate = payload && typeof payload === "object" ? Number((payload as { usd?: unknown }).usd) : NaN;
    if (!response.ok || !Number.isFinite(estimate) || estimate < 0) {
      return { ok: false, error: providerError(payload, "Higgsfield no pudo estimar el costo del video.") };
    }
    costUsd += estimate;
  }
  return { ok: true, costUsd };
}

export async function submitHiggsfieldVideoSegment(input: {
  model: HiggsfieldVideoModel;
  prompt: string;
  duration: number;
  aspectRatio: string;
  idempotencyKey: string;
}): Promise<{ ok: true; submission: HiggsfieldSubmission } | { ok: false; error: string }> {
  const auth = credentials();
  if (!auth) return { ok: false, error: "Higgsfield no está configurado en el servidor." };
  const response = await fetch(endpoint(input.model), {
    method: "POST",
    headers: {
      ...auth,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify(
      requestBody({
        prompt: input.prompt.slice(0, 1000),
        duration: input.duration,
        aspect_ratio: input.aspectRatio,
      }),
    ),
    cache: "no-store",
  });
  const payload = await readJson(response);
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const requestId = typeof record?.request_id === "string" ? record.request_id : "";
  const statusUrl = typeof record?.status_url === "string" ? record.status_url : "";
  let parsedStatusUrl: URL | null = null;
  try {
    parsedStatusUrl = new URL(statusUrl);
  } catch {
    // The response is rejected below unless it includes the documented status URL.
  }
  if (
    response.ok &&
    /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(requestId) &&
    parsedStatusUrl?.origin === apiBase &&
    parsedStatusUrl.pathname === `/requests/${requestId}/status`
  ) {
    return { ok: true, submission: { requestId, statusUrl } };
  }
  return { ok: false, error: providerError(payload, "Higgsfield no aceptó el segmento de video.") };
}

export async function readHiggsfieldVideoStatus(statusUrl: string): Promise<HiggsfieldStatus> {
  const auth = credentials();
  if (!auth) return { ok: false, error: "Higgsfield no está configurado en el servidor." };
  let parsed: URL;
  try {
    parsed = new URL(statusUrl);
  } catch {
    return { ok: false, error: "La solicitud de Higgsfield no tiene una URL de estado válida." };
  }
  if (parsed.origin !== apiBase || !/^\/requests\/[\da-f-]+\/status$/i.test(parsed.pathname)) {
    return { ok: false, error: "La solicitud de Higgsfield no tiene una URL de estado válida." };
  }
  const response = await fetch(parsed, { headers: auth, cache: "no-store" });
  const payload = await readJson(response);
  if (!response.ok || !payload || typeof payload !== "object") {
    return { ok: false, error: providerError(payload, "No se pudo consultar el video en Higgsfield.") };
  }
  const record = payload as { status?: unknown; video?: { url?: unknown }; error?: unknown };
  const status = typeof record.status === "string" ? record.status : "";
  if (!status) return { ok: false, error: "Higgsfield devolvió un estado inválido." };
  const videoUrl = typeof record.video?.url === "string" ? record.video.url : undefined;
  if (videoUrl) {
    try {
      if (new URL(videoUrl).protocol !== "https:") return { ok: false, error: "Higgsfield devolvió un archivo no seguro." };
    } catch {
      return { ok: false, error: "Higgsfield devolvió un archivo no válido." };
    }
  }
  return { ok: true, status, ...(videoUrl ? { videoUrl } : {}) };
}

export async function downloadHiggsfieldVideo(videoUrl: string) {
  const url = new URL(videoUrl);
  if (url.protocol !== "https:") return { ok: false as const, error: "El archivo de video no es válido." };
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok || !response.body) {
    return { ok: false as const, error: "El archivo generado por Higgsfield ya no está disponible." };
  }
  const contentType = response.headers.get("content-type") ?? "video/mp4";
  if (!contentType.startsWith("video/")) return { ok: false as const, error: "Higgsfield devolvió un archivo no válido." };
  return { ok: true as const, body: response.body, contentType };
}

export function higgsfieldAspectRatio(format: string) {
  if (format === "9:16") return "9:16";
  if (format === "1:1") return "1:1";
  return "16:9";
}
