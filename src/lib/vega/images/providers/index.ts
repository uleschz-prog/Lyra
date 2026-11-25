// Crea el proveedor de imágenes de una fila (proveedor + modelo guardados al cobrar).
import { gatewayMode } from "@/lib/ai/models";
import { type ImageProviderId, imageModel, imageProvider } from "@/lib/vega/images/config";
import { createGatewayImageProvider } from "@/lib/vega/images/providers/gateway";
import { createOpenAIImageProvider } from "@/lib/vega/images/providers/openai";
import type { ImageProvider } from "@/lib/vega/images/providers/types";

export type { ImageProvider, ImageRequest, ImageResult } from "@/lib/vega/images/providers/types";

type Env = Record<string, string | undefined>;

export function createImageProvider(id: string, model: string, env: Env = process.env): ImageProvider | null {
  if (id === "openai") {
    const key = env.OPENAI_API_KEY?.trim();
    return key ? createOpenAIImageProvider(model, key) : null;
  }
  if (id === "gateway") return gatewayMode(env).enabled ? createGatewayImageProvider(model) : null;
  return null;
}

/** Proveedor principal según VEGA_IMAGE_PROVIDER / VEGA_IMAGE_MODEL. */
export function selectImageProvider(env: Env = process.env): ImageProvider | null {
  const id: ImageProviderId | null = imageProvider(env);
  return id ? createImageProvider(id, imageModel(id, env), env) : null;
}
