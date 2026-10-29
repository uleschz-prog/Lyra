import { randomUUID } from "node:crypto";
import sharp from "sharp";

import { providerError, readJson } from "@/lib/ai/providers";

const apiBase = "https://api.higgsfield.ai";
const endpointId = "marketing-studio/image/flare";
// Base64 output stays below the studio's 1.9 MB persistence limit.
const maxSourceImageBytes = 12 * 1024 * 1024;
const maxImageBytes = 1_400_000;
const terminalStatuses = new Set(["completed", "failed", "nsfw", "canceled"]);

type ImageResult = { ok: true; dataUrl: string; note: string } | { ok: false; error: string };
type ImageError = { ok: false; error: string };
export type HiggsfieldImageSubmission = { requestId: string; statusUrl: string };
export type HiggsfieldImageStatus =
  | { ok: true; status: string; imageUrl?: string; error?: string }
  | { ok: false; error: string };

function failure(stage: string, error: string, statusCode?: number): ImageError {
  console.error("[Higgsfield image]", { stage, ...(statusCode ? { statusCode } : {}) });
  return { ok: false, error };
}

function credentials() {
  const keyId = process.env.HIGGSFIELD_API_KEY_ID?.trim() ?? "";
  const keySecret = process.env.HIGGSFIELD_API_KEY_SECRET?.trim() ?? "";
  return keyId && keySecret ? { Authorization: `Key ${keyId}:${keySecret}` } : null;
}

export function higgsfieldImageAspectRatio(size?: string) {
  if (size === "horizontal" || size === "16:9") return "16:9";
  if (size === "vertical" || size === "9:16") return "9:16";
  return "1:1";
}

function statusUrl(value: unknown, requestId: string) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.origin !== apiBase || url.pathname !== `/requests/${requestId}/status`) return null;
    return url;
  } catch {
    return null;
  }
}

export async function readHiggsfieldImageStatus(submission: HiggsfieldImageSubmission): Promise<HiggsfieldImageStatus> {
  const auth = credentials();
  if (!auth) return failure("status_credentials", "Higgsfield no está configurado en el servidor.");
  const status = statusUrl(submission.statusUrl, submission.requestId);
  if (!status) return failure("status_url", "La solicitud de Higgsfield no tiene una URL de estado válida.");

  let response: Response;
  try {
    response = await fetch(status, { headers: auth, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch {
    return failure("status_network", "No pudimos consultar el estado de la imagen en Higgsfield.");
  }
  const payload = await readJson(response);
  if (!response.ok || !payload || typeof payload !== "object") {
    return failure(
      "status_response",
      providerError(payload, "Higgsfield no pudo consultar el estado de la imagen."),
      response.status,
    );
  }

  const record = payload as { status?: unknown; images?: unknown; error?: unknown };
  const state = typeof record.status === "string" ? record.status : "";
  if (!state) return failure("status_invalid", "Higgsfield devolvió un estado de imagen inválido.");
  if (state === "completed") {
    const firstImage = Array.isArray(record.images) ? record.images[0] : null;
    const imageUrl = firstImage && typeof firstImage === "object" ? (firstImage as { url?: unknown }).url : null;
    if (typeof imageUrl !== "string") {
      return failure("completed_without_image", "Higgsfield terminó sin entregar la imagen.");
    }
    return { ok: true, status: state, imageUrl };
  }
  if (terminalStatuses.has(state)) {
    return {
      ok: true,
      status: state,
      error: providerError(record.error ?? payload, `Higgsfield no pudo generar la imagen (${state}).`),
    };
  }
  return { ok: true, status: state };
}

async function pollImage(submission: HiggsfieldImageSubmission, deadline: number) {
  let delayMs = 2000;
  while (Date.now() < deadline) {
    const result = await readHiggsfieldImageStatus(submission);
    if (!result.ok) return result;
    if (result.status === "completed") {
      return result.imageUrl
        ? { ok: true as const, imageUrl: result.imageUrl }
        : { ok: false as const, error: "Higgsfield terminó sin entregar la imagen." };
    }
    if (terminalStatuses.has(result.status)) {
      return { ok: false as const, error: result.error ?? `Higgsfield no pudo generar la imagen (${result.status}).` };
    }

    await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, Math.max(0, deadline - Date.now()))));
    delayMs = Math.min(Math.ceil(delayMs * 1.5), 10_000);
  }
  return { ok: false as const, error: "Higgsfield sigue generando la imagen. Intenta de nuevo en un momento." };
}

export async function downloadHiggsfieldImage(imageUrl: string): Promise<ImageResult> {
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return failure("download_url", "Higgsfield devolvió una dirección de imagen no válida.");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    return failure("download_url", "Higgsfield devolvió una dirección de imagen no segura.");
  }

  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  } catch {
    return failure("download_network", "No pudimos descargar la imagen generada por Higgsfield.");
  }
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (!response.ok || !response.body || !/^image\/(png|jpeg|webp)$/.test(contentType)) {
    return failure("download_response", "Higgsfield no entregó un archivo de imagen compatible.", response.status);
  }
  if (contentLength > maxSourceImageBytes) {
    return failure("download_too_large", "La imagen generada supera el límite de descarga.", response.status);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxSourceImageBytes) {
        await reader.cancel();
        return failure("download_too_large", "La imagen generada supera el límite de descarga.");
      }
      chunks.push(value);
    }
  } catch {
    return failure("download_incomplete", "La descarga de la imagen generada quedó incompleta.");
  }

  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  try {
    const optimized = await sharp(bytes, { limitInputPixels: 20_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    if (optimized.byteLength > maxImageBytes) {
      return failure("optimized_too_large", "La imagen generada supera el límite de almacenamiento.");
    }
    return {
      ok: true,
      dataUrl: `data:image/jpeg;base64,${optimized.toString("base64")}`,
      note: "Imagen generada con Higgsfield Marketing Studio.",
    };
  } catch {
    return failure("image_processing", "No pudimos preparar la imagen generada por Higgsfield.");
  }
}

export async function submitHiggsfieldImage(prompt: string, size?: string): Promise<
  | { ok: true; submission: HiggsfieldImageSubmission }
  | { ok: false; error: string }
> {
  const auth = credentials();
  if (!auth) return failure("submit_credentials", "Higgsfield no está configurado en el servidor.");
  const cleanPrompt = prompt.trim().slice(0, 5000);
  if (!cleanPrompt) return failure("submit_prompt", "Describe la imagen que quieres generar.");

  let response: Response;
  try {
    response = await fetch(`${apiBase}/${endpointId}`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json", "Idempotency-Key": randomUUID() },
      body: JSON.stringify({
        prompt: cleanPrompt,
        resolution: "1k",
        aspect_ratio: higgsfieldImageAspectRatio(size),
        quality: "low",
        enhance_prompt: false,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return failure("submit_network", "No pudimos enviar la solicitud de imagen a Higgsfield.");
  }

  const payload = await readJson(response);
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const requestId = typeof record?.request_id === "string" ? record.request_id : "";
  const status = statusUrl(record?.status_url, requestId);
  if (
    !response.ok ||
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(requestId) ||
    !status
  ) {
    return failure(
      "submit_response",
      providerError(payload, "Higgsfield no aceptó la solicitud de imagen."),
      response.status,
    );
  }

  return { ok: true, submission: { requestId, statusUrl: status.toString() } };
}

export async function generateHiggsfieldImage(prompt: string, size?: string): Promise<ImageResult> {
  const submission = await submitHiggsfieldImage(prompt, size);
  if (!submission.ok) return submission;
  const result = await pollImage(submission.submission, Date.now() + 50_000);
  if (!result.ok) return result;
  return downloadHiggsfieldImage(result.imageUrl);
}
