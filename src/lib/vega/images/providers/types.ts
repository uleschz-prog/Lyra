import type { AspectRatio, ImageQuality } from "@/lib/vega/images/config";

export type ImageRequest = {
  prompt: string;
  aspect: AspectRatio;
  quality: ImageQuality;
  /** Imágenes de referencia (bytes); se usan para editar o mantener estilo/logo. */
  references: { data: Uint8Array; mediaType: string }[];
  abortSignal: AbortSignal;
};

export type ImageResult = {
  data: Uint8Array;
  mediaType: string;
  /** Modelo que respondió (id del proveedor). */
  model: string;
  /** Costo real si el proveedor lo informa (USD). */
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

/** Un proveedor de imágenes intercambiable (seleccionado por VEGA_IMAGE_PROVIDER). */
export type ImageProvider = {
  id: string;
  model: string;
  generate: (request: ImageRequest) => Promise<ImageResult>;
};
