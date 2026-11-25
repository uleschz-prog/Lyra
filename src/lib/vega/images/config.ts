/**
 * Imágenes de Vega (flyers, posts): configuración por variables de entorno.
 *
 * Proveedor (VEGA_IMAGE_PROVIDER):
 * - gateway (por defecto cuando el AI Gateway está activo): Vercel AI Gateway, la misma llave y
 *   factura que el chat (AI_GATEWAY_API_KEY o VEGA_AI_GATEWAY=oidc).
 * - openai: API de OpenAI directa con OPENAI_API_KEY (alternativa; otra factura).
 * - off: apaga la herramienta.
 * Sin Blob (BLOB_READ_WRITE_TOKEN) la herramienta no se ofrece: la imagen se guarda en Blob privado.
 */
import { gatewayMode } from "@/lib/ai/models";

type Env = Record<string, string | undefined>;

export type ImageProviderId = "gateway" | "openai";
/** Formatos de GPT Image (los tres tamaños con precio publicado por OpenAI). */
export type GptAspectRatio = "1:1" | "2:3" | "3:2";
/** Formatos verticales de redes (historias/Reels 9:16, post vertical 4:5): van a un modelo Gemini por el Gateway. */
export type StoryAspectRatio = "9:16" | "4:5";
export type AspectRatio = GptAspectRatio | StoryAspectRatio;
export type ImageQuality = "low" | "medium" | "high";

/** Imágenes de referencia por petición. */
export const MAX_REFERENCES = 3;

export const gptAspectRatios: GptAspectRatio[] = ["1:1", "2:3", "3:2"];
export const storyAspectRatios: StoryAspectRatio[] = ["9:16", "4:5"];
export const aspectRatios: AspectRatio[] = [...gptAspectRatios, ...storyAspectRatios];

export function isStoryAspect(aspect: string): aspect is StoryAspectRatio {
  return (storyAspectRatios as string[]).includes(aspect);
}

export function asAspectRatio(value: unknown): AspectRatio | null {
  return typeof value === "string" && (aspectRatios as string[]).includes(value) ? (value as AspectRatio) : null;
}

/** Tamaños de GPT Image para cada formato. */
export const sizeFor: Record<GptAspectRatio, `${number}x${number}`> = {
  "1:1": "1024x1024",
  "2:3": "1024x1536",
  "3:2": "1536x1024",
};

export const defaultImageModel = "openai/gpt-image-2";

/**
 * Modelo de los formatos 9:16 y 4:5: Nano Banana Pro (Gemini 3 Pro Image). Google lo describe como
 * «the premium choice … render high-fidelity text» y recomienda usarlo para «professional asset production»
 * (https://ai.google.dev/gemini-api/docs/image-generation). Soporta 9:16 (768x1376 / 1536x2752) y 4:5
 * (928x1152 / 1856x2304) en esa misma página. En el Gateway: google/gemini-3-pro-image.
 */
export const defaultStoryModel = "google/gemini-3-pro-image";

/**
 * Costo estimado por imagen en USD (salida) para GPT Image 2, de la tabla de OpenAI
 * (https://platform.openai.com/docs/guides/image-generation, «Cost and latency», revisada 2026-11-25).
 * El Gateway cobra los mismos precios de lista por token. Se usa para el tope mensual antes de generar;
 * el costo real que reporte el Gateway reemplaza esta estimación cuando llega.
 */
const gptImage2Usd: Record<ImageQuality, Record<GptAspectRatio, number>> = {
  low: { "1:1": 0.006, "2:3": 0.005, "3:2": 0.005 },
  medium: { "1:1": 0.053, "2:3": 0.041, "3:2": 0.041 },
  high: { "1:1": 0.211, "2:3": 0.165, "3:2": 0.165 },
};

/**
 * Precio por imagen de salida de los modelos Gemini con imagen, por resolución
 * (https://ai.google.dev/gemini-api/docs/pricing, revisada 2026-11-25; el Gateway lista los mismos en /v1/models).
 * Pedimos la resolución más alta que cuesta lo mismo que 1K (Pro: 1K y 2K valen $0.134).
 */
const geminiImageUsd: Record<string, { size: "1K" | "2K"; usd: number }> = {
  "gemini-3-pro-image": { size: "2K", usd: 0.134 },
  "gemini-nano-banana-2.1": { size: "1K", usd: 0.0336 },
  "gemini-3.1-flash-image": { size: "1K", usd: 0.067 },
};

/** Resolución que se pide a un modelo Gemini (null = la de fábrica del modelo). */
export function geminiImageSize(model: string): "1K" | "2K" | null {
  return geminiImageUsd[model.split("/").pop() ?? model]?.size ?? null;
}

/**
 * Margen para la entrada: prompt (≈ 1–2k tokens de texto) e imágenes de referencia.
 * GPT Image 2: $5/M texto y $8/M imagen de entrada; Gemini 3 Pro Image: $2/M y $0.0011 por imagen.
 */
const inputAllowanceUsd = 0.01;

function readInt(raw: string | undefined, fallback: number, min: number, max: number) {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function readFloat(raw: string | undefined, fallback: number, min: number, max: number) {
  const value = Number.parseFloat(raw ?? "");
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

const modelId = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i;

export function imageProvider(env: Env = process.env): ImageProviderId | null {
  const raw = env.VEGA_IMAGE_PROVIDER?.trim().toLowerCase() ?? "";
  if (["off", "false", "0", "no"].includes(raw)) return null;
  if (raw === "openai") return env.OPENAI_API_KEY?.trim() ? "openai" : null;
  if (raw === "gateway" || raw === "") return gatewayMode(env).enabled ? "gateway" : null;
  return null;
}

/** Modelo: con Gateway, un id «proveedor/modelo» de https://ai-gateway.vercel.sh/v1/models; con openai, el nombre de OpenAI. */
export function imageModel(provider: ImageProviderId, env: Env = process.env) {
  const raw = env.VEGA_IMAGE_MODEL?.trim() ?? "";
  if (provider === "openai") {
    const bare = raw.includes("/") ? raw.split("/").pop() ?? "" : raw;
    return /^[a-z0-9][a-z0-9._-]*$/i.test(bare) && bare ? bare : defaultImageModel.split("/")[1];
  }
  return modelId.test(raw) ? raw : defaultImageModel;
}

export function imageQuality(env: Env = process.env): ImageQuality {
  const raw = env.VEGA_IMAGE_QUALITY?.trim().toLowerCase();
  return raw === "low" || raw === "medium" ? raw : "high";
}

/** Modelo de 9:16 y 4:5 (VEGA_IMAGE_STORY_MODEL): un modelo del Gateway que acepte esos formatos (no GPT Image). */
export function storyImageModel(env: Env = process.env) {
  const raw = env.VEGA_IMAGE_STORY_MODEL?.trim() ?? "";
  return modelId.test(raw) && !/^openai\/gpt-image/i.test(raw) ? raw : defaultStoryModel;
}

/** Los formatos 9:16 y 4:5 solo existen por el Gateway (la API directa de OpenAI no tiene esos tamaños). */
export function storyFormatsAvailable(env: Env = process.env) {
  return imageProvider(env) !== null && gatewayMode(env).enabled && !["off", "false", "0", "no"].includes(env.VEGA_IMAGE_STORY_MODEL?.trim().toLowerCase() ?? "");
}

export function availableAspectRatios(env: Env = process.env): AspectRatio[] {
  return storyFormatsAvailable(env) ? aspectRatios : gptAspectRatios;
}

export type ImageRoute = { provider: ImageProviderId; model: string };

/** Proveedor y modelo de un formato: 1:1, 2:3 y 3:2 van al modelo principal; 9:16 y 4:5 al de historias. */
export function imageRoute(aspect: AspectRatio, env: Env = process.env): ImageRoute | null {
  const provider = imageProvider(env);
  if (!provider) return null;
  if (isStoryAspect(aspect)) return storyFormatsAvailable(env) ? { provider: "gateway", model: storyImageModel(env) } : null;
  return { provider, model: imageModel(provider, env) };
}

export function blobConfigured(env: Env = process.env) {
  return Boolean(env.BLOB_READ_WRITE_TOKEN?.trim());
}

/** La herramienta se ofrece solo con proveedor y Blob listos. */
export function imagesEnabled(env: Env = process.env) {
  return imageProvider(env) !== null && blobConfigured(env);
}

export function imageSettings(env: Env = process.env) {
  return {
    /** Créditos por imagen (1 crédito = 1 USD en LYRA). Se devuelven si falla. */
    priceCredits: readInt(env.VEGA_IMAGE_PRICE_CREDITS, 2, 0, 100),
    /** Tope global de gasto del proveedor por mes calendario (CDMX), en USD. 0 = sin imágenes. */
    monthlyCapUsd: readFloat(env.VEGA_IMAGE_MONTHLY_CAP_USD, 25, 0, 100_000),
    perHour: readInt(env.VEGA_IMAGE_PER_HOUR, 6, 0, 1000),
    perDay: readInt(env.VEGA_IMAGE_PER_DAY, 20, 0, 10_000),
    /** Tiempo máximo de una llamada al proveedor (Vercel Hobby corta a los 60 s). */
    timeoutMs: readInt(env.VEGA_IMAGE_TIMEOUT_MS, 50_000, 10_000, 55_000),
    /** Lectura del texto con un modelo barato de visión después de generar (opcional). */
    textCheck: ["on", "true", "1", "yes"].includes(env.VEGA_IMAGE_TEXT_CHECK?.trim().toLowerCase() ?? ""),
    maxAttempts: 2,
    leaseMs: 58_000,
  };
}

/**
 * Estimación previa del costo de una imagen (para el tope mensual). Modelos sin tabla usan
 * VEGA_IMAGE_EST_COST_USD (vacío 0.25, por encima del caso más caro con tabla: GPT Image 2 high 1:1 = $0.221).
 */
export function estimateImageCostUsd(model: string, aspect: AspectRatio, quality: ImageQuality, env: Env = process.env) {
  const bare = model.split("/").pop() ?? model;
  if (bare === "gpt-image-2" && !isStoryAspect(aspect)) return round(gptImage2Usd[quality][aspect] + inputAllowanceUsd);
  const gemini = geminiImageUsd[bare];
  if (gemini) return round(gemini.usd + inputAllowanceUsd);
  return readFloat(env.VEGA_IMAGE_EST_COST_USD, 0.25, 0, 10);
}

function round(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
