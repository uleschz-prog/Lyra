// Errores de los proveedores de imagen → tipo + mensaje amable en español (el detalle solo va a los logs).

export type ImageErrorKind = "policy" | "timeout" | "rate_limit" | "quota" | "auth" | "invalid" | "provider" | "storage" | "empty";

export class ImageProviderError extends Error {
  constructor(
    readonly kind: ImageErrorKind,
    readonly detail: string,
    readonly status?: number,
  ) {
    super(detail);
    this.name = "ImageProviderError";
  }
}

const friendly: Record<ImageErrorKind, string> = {
  policy: "El generador de imágenes rechazó esta petición por sus reglas de contenido. Prueba describiéndola de otra forma (sin marcas registradas, personas reales ni contenido sensible).",
  timeout: "La imagen tardó demasiado en generarse. Intenta de nuevo en un momento.",
  rate_limit: "El generador de imágenes está saturado en este momento. Intenta de nuevo en unos minutos.",
  quota: "El generador de imágenes no está disponible por ahora. Intenta más tarde.",
  auth: "El generador de imágenes no está disponible por ahora. Intenta más tarde.",
  invalid: "No se pudo generar la imagen con esas indicaciones. Prueba con una descripción más sencilla.",
  provider: "El generador de imágenes falló. Intenta de nuevo en unos minutos.",
  storage: "La imagen se generó, pero no se pudo guardar. Intenta de nuevo en unos minutos.",
  empty: "El generador no devolvió ninguna imagen. Intenta de nuevo con otra descripción.",
};

export function friendlyImageError(kind: ImageErrorKind) {
  return friendly[kind];
}

const policyPattern = /moderation|safety|content[ _-]?policy|policy[ _-]?violation|blocked|prohibited|not allowed|inappropriate|responsible ?ai|sensitive/i;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** Texto corto y seguro para logs (sin cuerpos enormes ni datos de la imagen). */
function detailOf(error: unknown) {
  const record = asRecord(error);
  const name = typeof record.name === "string" ? record.name : error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const body = typeof record.responseBody === "string" ? record.responseBody : "";
  return `${name}: ${`${message} ${body}`.replace(/[A-Za-z0-9+/=]{200,}/g, "[datos]").replace(/\s+/g, " ").trim()}`.slice(0, 400);
}

/** Clasifica cualquier error de AI SDK / Gateway / OpenAI / fetch. */
export function classifyImageError(error: unknown): ImageProviderError {
  if (error instanceof ImageProviderError) return error;
  const record = asRecord(error);
  const cause = asRecord(record.cause);
  const detail = detailOf(error);
  const name = String(record.name ?? "");
  const type = String(record.type ?? cause.type ?? "");
  const rawStatus = record.statusCode ?? cause.statusCode ?? record.status;
  const status = typeof rawStatus === "number" ? rawStatus : undefined;
  const text = `${detail} ${type}`;

  if (name === "AbortError" || name === "TimeoutError" || type === "timeout_error" || name === "GatewayTimeoutError" || status === 408 || status === 504) {
    return new ImageProviderError("timeout", detail, status);
  }
  if (policyPattern.test(text) && (status === undefined || status === 400 || status === 403 || status === 422)) return new ImageProviderError("policy", detail, status);
  if (status === 429 || type === "rate_limit_exceeded") return new ImageProviderError(/quota|insufficient|billing|credit/i.test(text) ? "quota" : "rate_limit", detail, status);
  if (status === 402 || /insufficient[_ ](funds|quota|credits)|billing/i.test(text)) return new ImageProviderError("quota", detail, status);
  if (status === 401 || status === 403 || type === "authentication_error" || type === "forbidden" || type === "access_policy_denied") return new ImageProviderError("auth", detail, status);
  if (name === "AI_NoImageGeneratedError" || name === "NoImageGeneratedError") return new ImageProviderError(policyPattern.test(text) ? "policy" : "empty", detail, status);
  if (status === 400 || status === 404 || status === 422 || type === "invalid_request_error" || type === "model_not_found") return new ImageProviderError("invalid", detail, status);
  return new ImageProviderError("provider", detail, status);
}

/** ¿Vale la pena reintentar en otra llamada? (las reglas de contenido y los datos inválidos no). */
export function retryable(kind: ImageErrorKind) {
  return kind === "timeout" || kind === "rate_limit" || kind === "provider" || kind === "storage" || kind === "empty";
}
