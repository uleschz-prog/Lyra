import { geminiCredentials } from "@/lib/ai/generate";
import { providerError, readJson } from "@/lib/ai/providers";
import { renderStudioVideo } from "@/lib/studio/render-video";

export type StillResult = { ok: true; dataUrl: string; note: string } | { ok: false; error: string };
export type ClipResult =
  | { ok: true; url: string; note: string }
  | { ok: false; pending: true; jobId: string; note: string }
  | { ok: false; error: string };

export type VideoQuality = "4K" | "1080p";

const fallbackImageModels = ["gemini-3.1-flash-image", "gemini-2.5-flash-image"];
const textVideoModels = new Set(["gen4.5", "veo3", "veo3.1", "veo3.1_fast", "seedance2"]);

export function imageModels() {
  const chosen = process.env.GEMINI_IMAGE_MODEL?.trim();
  return [...new Set([chosen, ...fallbackImageModels].filter((model): model is string => Boolean(model)))];
}

export function aspectHint(size?: string) {
  if (size === "horizontal" || size === "16:9") return "Formato horizontal 16:9.";
  if (size === "vertical" || size === "9:16") return "Formato vertical 9:16.";
  return "Formato cuadrado 1:1.";
}

export function runwayRatio(format?: string) {
  if (format === "16:9" || format === "horizontal") return "1280:720";
  if (format === "1:1" || format === "cuadrada") return "960:960";
  return "720:1280";
}

export function runwayCredentials() {
  const apiKey = process.env.RUNWAYML_API_SECRET?.trim() || process.env.RUNWAY_API_KEY?.trim() || "";
  const model = process.env.RUNWAY_DEFAULT_MODEL?.trim() || "gen4.5";
  return { apiKey, model };
}

function dataUrl(mime: string, data: string) {
  return `data:${mime || "image/png"};base64,${data}`;
}

function readImageBlock(value: unknown): { mime: string; data: string } | null {
  if (!value || typeof value !== "object") return null;
  const block = value as {
    data?: unknown;
    mime_type?: unknown;
    mimeType?: unknown;
    inlineData?: { data?: unknown; mimeType?: unknown };
    image?: unknown;
  };
  if (block.inlineData && typeof block.inlineData.data === "string" && block.inlineData.data.length > 40) {
    const mime = typeof block.inlineData.mimeType === "string" ? block.inlineData.mimeType : "image/png";
    return { mime, data: block.inlineData.data };
  }
  if (typeof block.data === "string" && block.data.length > 40) {
    const mime =
      typeof block.mime_type === "string" ? block.mime_type : typeof block.mimeType === "string" ? block.mimeType : "image/png";
    return { mime, data: block.data };
  }
  if (block.image) return readImageBlock(block.image);
  return null;
}

export function imageFromPayload(payload: unknown): { mime: string; data: string } | null {
  const direct = readImageBlock(payload);
  if (direct) return direct;
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  for (const key of ["output_image", "outputImage"]) {
    const found = readImageBlock(record[key]);
    if (found) return found;
  }
  const steps = record.steps;
  if (Array.isArray(steps)) {
    for (const step of steps) {
      const found = readImageBlock(step) ?? (step && typeof step === "object" ? readImageBlock((step as { content?: unknown }).content) : null);
      if (found) return found;
    }
  }
  const candidates = record.candidates;
  if (!Array.isArray(candidates)) return null;
  const parts = (candidates[0] as { content?: { parts?: unknown } } | undefined)?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    const found = readImageBlock(part);
    if (found) return found;
  }
  return null;
}

export function openRouterVideoModel() {
  return process.env.OPENROUTER_VIDEO_MODEL?.trim() || "google/veo-3.1";
}

export function openRouterJob(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const status = typeof record.status === "string" ? record.status : "";
  const urls = Array.isArray(record.unsigned_urls)
    ? record.unsigned_urls.filter((item): item is string => typeof item === "string" && item.startsWith("https://"))
    : [];
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id) || !status) return null;
  return { id, status, urls };
}

export function runwayOutputUrl(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const output = (payload as { output?: unknown }).output;
  if (typeof output === "string" && output.startsWith("http")) return output;
  if (Array.isArray(output)) {
    const url = output.find((item) => typeof item === "string" && item.startsWith("http"));
    return typeof url === "string" ? url : null;
  }
  return null;
}

async function requestStill(apiKey: string, model: string, prompt: string): Promise<StillResult | { retry: true; error: string }> {
  const headers = { "Content-Type": "application/json", "x-goog-api-key": apiKey };
  const interactions = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers,
    body: JSON.stringify({ model, input: [{ type: "text", text: prompt }] }),
  });
  const first = await readJson(interactions);
  if (interactions.ok) {
    const image = imageFromPayload(first);
    if (image) return { ok: true, dataUrl: dataUrl(image.mime, image.data), note: `Imagen generada con ${model}.` };
  } else if (interactions.status === 401 || interactions.status === 403) {
    return { ok: false, error: providerError(first, "La clave de imagen no tiene permiso.") };
  }

  const content = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  });
  const second = await readJson(content);
  if (content.status === 401 || content.status === 403) {
    return { ok: false, error: providerError(second, "La clave de imagen no tiene permiso.") };
  }
  if (!content.ok) {
    return { retry: true, error: providerError(second, "El proveedor de imagen no pudo responder.") };
  }
  const image = imageFromPayload(second);
  if (!image) return { retry: true, error: "El proveedor no devolvió una imagen. Intenta con otra descripción." };
  return { ok: true, dataUrl: dataUrl(image.mime, image.data), note: `Imagen generada con ${model}.` };
}

export async function generateStill(prompt: string, size?: string): Promise<StillResult> {
  const { apiKey } = geminiCredentials();
  if (!apiKey) return { ok: false, error: "La generación de imágenes no está configurada en el servidor." };

  const full = `${prompt.trim()}\n${aspectHint(size)}`;
  let last = "El proveedor no devolvió una imagen.";
  for (const model of imageModels()) {
    const result = await requestStill(apiKey, model, full).catch(() => ({
      retry: true as const,
      error: "El proveedor de imagen no respondió.",
    }));
    if ("ok" in result) return result;
    last = result.error;
    if (!result.retry) return { ok: false, error: result.error };
  }
  return { ok: false, error: last };
}

async function waitForRunway(apiKey: string, id: string, waitMs: number) {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const response = await fetch(`https://api.dev.runwayml.com/v1/tasks/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}`, "X-Runway-Version": "2024-11-06" },
    });
    const payload = await readJson(response);
    if (!response.ok) return { ok: false as const, error: providerError(payload, "Runway no pudo consultar el video.") };
    const status = payload && typeof payload === "object" ? (payload as { status?: unknown }).status : "";
    if (status === "SUCCEEDED") {
      const url = runwayOutputUrl(payload);
      return url ? { ok: true as const, url } : { ok: false as const, error: "Runway terminó sin un archivo de video." };
    }
    if (status === "FAILED" || status === "CANCELLED") {
      return { ok: false as const, error: providerError(payload, "Runway no pudo crear el video.") };
    }
  }
  return { ok: false as const, error: "El video sigue generándose. Intenta de nuevo en un momento." };
}

async function runwayClip(input: { title: string; script: string; format?: string }, waitMs: number): Promise<ClipResult> {
  const { apiKey, model } = runwayCredentials();
  if (!apiKey) return { ok: false, error: "El video de IA no está configurado." };

  const promptText = `${input.title}. ${input.script}`.replace(/\s+/g, " ").trim().slice(0, 1000);
  const ratio = runwayRatio(input.format);
  const duration = model === "veo3" ? 8 : 5;
  const text = textVideoModels.has(model);
  const body: Record<string, unknown> = { model, promptText, ratio, duration };
  if (!text) {
    const still = await generateStill(promptText, input.format);
    if (!still.ok) return still;
    body.promptImage = still.dataUrl;
  }

  const response = await fetch(`https://api.dev.runwayml.com/v1/${text ? "text_to_video" : "image_to_video"}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Runway-Version": "2024-11-06",
    },
    body: JSON.stringify(body),
  });
  const payload = await readJson(response);
  if (!response.ok) return { ok: false, error: providerError(payload, "Runway no aceptó el video.") };
  const id = payload && typeof payload === "object" && typeof (payload as { id?: unknown }).id === "string" ? (payload as { id: string }).id : "";
  if (!id) return { ok: false, error: "Runway no devolvió la tarea del video." };
  const ready = await waitForRunway(apiKey, id, waitMs);
  if (!ready.ok) return ready;
  return { ok: true, url: ready.url, note: `Video generado con ${model}.` };
}

function openRouterAspect(format?: string) {
  if (format === "9:16" || format === "vertical") return "9:16";
  if (format === "1:1" || format === "cuadrada") return "1:1";
  return "16:9";
}

function openRouterSeconds(model: string) {
  return model.includes("seedance") ? 10 : 8;
}

async function openRouterClip(
  input: { title: string; script: string; format?: string; quality?: VideoQuality },
  waitMs: number,
): Promise<ClipResult> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() || "";
  if (!apiKey) return { ok: false, error: "OpenRouter no está configurado." };

  const model = openRouterVideoModel();
  const prompt = `${input.title}. ${input.script}. Anuncio cinematográfico, luz de lujo, cámara lenta, textura real, sin texto en pantalla.`
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1800);
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const resolutions = input.quality === "1080p" ? ["1080p"] : ["4K", "1080p"];
  let jobId = "";
  let lastError = "OpenRouter no aceptó el video.";

  for (const resolution of resolutions) {
    const response = await fetch("https://openrouter.ai/api/v1/videos", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        prompt,
        resolution,
        duration: openRouterSeconds(model),
        aspect_ratio: openRouterAspect(input.format),
        generate_audio: true,
      }),
    });
    const payload = await readJson(response);
    const job = openRouterJob(payload);
    if (response.ok && job) {
      jobId = job.id;
      if (job.status === "completed") {
        return { ok: true, url: `/api/ai/video?jobId=${job.id}&play=1`, note: `Anuncio ${resolution} con ${model}.` };
      }
      break;
    }
    lastError = providerError(payload, lastError);
    if (response.status === 401 || response.status === 403) return { ok: false, error: lastError };
  }

  if (!jobId) return { ok: false, error: lastError };

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const response = await fetch(`https://openrouter.ai/api/v1/videos/${jobId}`, { headers });
    const payload = await readJson(response);
    const job = openRouterJob(payload);
    if (!response.ok || !job) continue;
    if (job.status === "completed") {
      return { ok: true, url: `/api/ai/video?jobId=${job.id}&play=1`, note: `Anuncio premium con ${model}.` };
    }
    if (job.status === "failed" || job.status === "cancelled" || job.status === "expired") {
      return { ok: false, error: providerError(payload, "El render premium no se pudo completar.") };
    }
  }

  return { ok: false, pending: true, jobId, note: "El anuncio premium sigue renderizándose." };
}

export async function readOpenRouterVideo(jobId: string) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() || "";
  if (!apiKey || !/^[A-Za-z0-9_-]{6,80}$/.test(jobId)) return { ok: false as const, error: "Ese video no está disponible." };
  const headers = { Authorization: `Bearer ${apiKey}` };
  const status = await fetch(`https://openrouter.ai/api/v1/videos/${jobId}`, { headers });
  const payload = await readJson(status);
  const job = openRouterJob(payload);
  if (!status.ok || !job) return { ok: false as const, error: providerError(payload, "No se pudo consultar el video.") };
  if (job.status !== "completed") return { ok: true as const, status: job.status, jobId: job.id };
  const file = await fetch(`https://openrouter.ai/api/v1/videos/${jobId}/content?index=0`, { headers });
  if (!file.ok || !file.body) return { ok: false as const, error: "El archivo del video todavía no está listo." };
  return {
    ok: true as const,
    status: "completed" as const,
    jobId,
    body: file.body,
    contentType: file.headers.get("content-type") || "video/mp4",
  };
}

export async function generateClip(
  input: { title: string; script: string; format?: string; styleId?: string; duration?: string; captions?: boolean; quality?: VideoQuality },
  waitMs = 25_000,
): Promise<ClipResult> {
  if (input.quality) {
    const premium = await openRouterClip(input, waitMs).catch(() => ({ ok: false as const, error: "OpenRouter no respondió." }));
    if (premium.ok || ("pending" in premium && premium.pending)) return premium;
  }
  const runway = await runwayClip(input, waitMs).catch(() => ({ ok: false as const, error: "Runway no respondió." }));
  if (runway.ok) return runway;
  try {
    const video = await renderStudioVideo(input);
    return { ok: true, url: `data:video/mp4;base64,${video.toString("base64")}`, note: "Video listo." };
  } catch {
    return { ok: false, error: "No se pudo crear el archivo de video en el servidor." };
  }
}
