export const higgsfieldApiBase = "https://api.higgsfield.ai";

export function higgsfieldOutputContentType(kind: "image" | "video", bytes: Uint8Array, declaredType: string) {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  const isPng = bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const detectedType = isJpeg
    ? "image/jpeg"
    : isPng
      ? "image/png"
      : bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP"
        ? "image/webp"
        : bytes.length >= 12 && ascii(4, 8) === "ftyp"
          ? ascii(8, 12).startsWith("qt")
            ? "video/quicktime"
            : "video/mp4"
          : bytes.length >= 4 && [0x1a, 0x45, 0xdf, 0xa3].every((value, index) => bytes[index] === value)
            ? "video/webm"
            : "";
  const allowedType = kind === "image" ? /^image\/(png|jpeg|webp)$/ : /^video\/(mp4|webm|quicktime)$/;
  const normalizedDeclaredType = declaredType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (allowedType.test(detectedType)) return detectedType;
  return allowedType.test(normalizedDeclaredType) ? normalizedDeclaredType : null;
}

export type Soul2ImageOptions = {
  seed?: number;
  style_id?: string;
  custom_reference_id?: string;
  custom_reference_strength?: number;
  batch_size: 1 | 4;
  resolution: "720p" | "1080p";
  aspect_ratio: "9:16" | "16:9" | "4:3" | "3:4" | "1:1" | "2:3" | "3:2";
  enhance_prompt: boolean;
};

export type WanVideoOptions = {
  duration: number;
  resolution: "480p" | "720p" | "1080p";
  aspect_ratio: "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "adaptive";
  generate_audio: boolean;
  enable_thinking: boolean;
  seed?: number;
};

export function parseSoul2ImageOptions(value: unknown): Soul2ImageOptions | null {
  const options = value === undefined || value === null ? {} : value;
  if (typeof options !== "object" || Array.isArray(options)) return null;
  const record = options as Record<string, unknown>;
  const seed = record.seed;
  const styleId = record.style_id;
  const referenceId = record.custom_reference_id;
  const referenceStrength = record.custom_reference_strength ?? 1;
  const batchSize = record.batch_size ?? 1;
  const resolution = record.resolution ?? "720p";
  const aspectRatio = record.aspect_ratio ?? "4:3";
  const enhancePrompt = record.enhance_prompt ?? true;

  if (seed !== undefined && (!Number.isInteger(seed) || (seed as number) < 1 || (seed as number) > 1_000_000)) {
    return null;
  }
  if (styleId !== undefined && (typeof styleId !== "string" || !styleId.trim())) return null;
  if (
    referenceId !== undefined &&
    referenceId !== null &&
    (typeof referenceId !== "string" ||
      !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(referenceId))
  ) {
    return null;
  }
  if (typeof referenceStrength !== "number" || referenceStrength < 0 || referenceStrength > 1) return null;
  if ((typeof referenceId !== "string" || !referenceId) && referenceStrength !== 1) return null;
  if (batchSize !== 1 && batchSize !== 4) return null;
  if (resolution !== "720p" && resolution !== "1080p") return null;
  if (!["9:16", "16:9", "4:3", "3:4", "1:1", "2:3", "3:2"].includes(String(aspectRatio))) return null;
  if (typeof enhancePrompt !== "boolean") return null;

  return {
    ...(seed === undefined ? {} : { seed: seed as number }),
    ...(typeof styleId === "string" ? { style_id: styleId.trim() } : {}),
    ...(typeof referenceId === "string" ? { custom_reference_id: referenceId, custom_reference_strength: referenceStrength } : {}),
    batch_size: batchSize,
    resolution,
    aspect_ratio: aspectRatio as Soul2ImageOptions["aspect_ratio"],
    enhance_prompt: enhancePrompt,
  };
}

export function extractHiggsfieldOutputUrls(kind: "image" | "video", payload: unknown) {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const result =
    kind === "video"
      ? (record.video ?? record.result)
      : (record.result ?? (Array.isArray(record.images) ? record : null));
  if (!result || (kind === "image" && typeof result !== "object")) return [];
  const urls: string[] = [];

  if (kind === "image") {
    const images = record.images ?? (result as { images?: unknown }).images;
    if (!Array.isArray(images)) return [];
    for (const image of images.slice(0, 4)) {
      if (image && typeof image === "object" && typeof (image as { url?: unknown }).url === "string") {
        urls.push((image as { url: string }).url);
      }
    }
  } else {
    const visit = (value: unknown, depth: number) => {
      if (depth > 6 || value === null || value === undefined) return;
      if (typeof value === "string") {
        urls.push(value);
        return;
      }
      if (typeof value !== "object") return;
      if (Array.isArray(value)) {
        for (const item of value.slice(0, 8)) visit(item, depth + 1);
        return;
      }
      const item = value as Record<string, unknown>;
      if (typeof item.url === "string") urls.push(item.url);
      for (const [key, nested] of Object.entries(item)) {
        if (key !== "url") visit(nested, depth + 1);
      }
    };
    visit(result, 0);
  }

  return [...new Set(urls)].slice(0, 4).filter((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  });
}

export function parseWanVideoOptions(value: unknown): WanVideoOptions | null {
  const options = value === undefined || value === null ? {} : value;
  if (typeof options !== "object" || Array.isArray(options)) return null;
  const record = options as Record<string, unknown>;
  const duration = record.duration ?? 5;
  const resolution = record.resolution ?? "1080p";
  const aspectRatio = record.aspect_ratio ?? "adaptive";
  const generateAudio = record.generate_audio ?? true;
  const enableThinking = record.enable_thinking ?? false;
  const seed = record.seed;

  if (!Number.isInteger(duration) || (duration as number) < 2 || (duration as number) > 30) return null;
  if (!["480p", "720p", "1080p"].includes(String(resolution))) return null;
  if (!["16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"].includes(String(aspectRatio))) return null;
  if (typeof generateAudio !== "boolean" || typeof enableThinking !== "boolean") return null;
  if (seed !== undefined && (!Number.isInteger(seed) || (seed as number) < 0 || (seed as number) > 2147483647)) {
    return null;
  }

  return {
    duration: duration as number,
    resolution: resolution as WanVideoOptions["resolution"],
    aspect_ratio: aspectRatio as WanVideoOptions["aspect_ratio"],
    generate_audio: generateAudio,
    enable_thinking: enableThinking,
    ...(seed === undefined ? {} : { seed: seed as number }),
  };
}

export function higgsfieldGenerationRequest(
  kind: "image" | "video",
  prompt: string,
  videoOptions?: WanVideoOptions,
  imageOptions?: Soul2ImageOptions,
) {
  if (kind === "image") {
    const options = parseSoul2ImageOptions(imageOptions);
    if (!options) throw new Error("Los parámetros de imagen Soul 2 no son válidos.");
    return {
      endpoint: "/higgsfield-ai/soul/v2/standard",
      body: { prompt, ...options },
    };
  }
  const options = parseWanVideoOptions(videoOptions);
  if (!options) throw new Error("Los parámetros de video Wan no son válidos.");
  return {
    endpoint: "/alibaba/wan-3.0-prime/text-to-video",
    body: { prompt, ...options },
  };
}

export function higgsfieldAuthHeaders() {
  const keyId = process.env.HF_KEY_ID?.trim() ?? "";
  const keySecret = process.env.HF_KEY_SECRET?.trim() ?? "";
  return keyId && keySecret ? { Authorization: `Key ${keyId}:${keySecret}` } : null;
}

export function higgsfieldPublicError(status: number, payload: unknown, fallback: string) {
  if (status === 401) return "Higgsfield rechazó la autenticación. Revisa HF_KEY_ID y HF_KEY_SECRET.";
  if (status === 400) return "Higgsfield no puede aceptar más solicitudes en este momento. Inténtalo más tarde.";
  if (status === 422) {
    const message = extractMessage(payload);
    return message ?? "Higgsfield rechazó un parámetro de la solicitud.";
  }
  const message = extractMessage(payload);
  return message ?? fallback;
}

function extractMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const error = record.error;
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error.message
        : typeof record.message === "string"
          ? record.message
          : null;
  if (!message) return null;
  return message
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\b(?:Key\s+)?[A-Za-z0-9_-]{16,}:[A-Za-z0-9_-]{16,}\b/g, "[credencial oculta]")
    .slice(0, 300);
}
