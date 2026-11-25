// Elige el proveedor de imágenes según VEGA_IMAGE_PROVIDER / VEGA_IMAGE_MODEL.
import { imageModel, imageProvider } from "@/lib/vega/images/config";
import { createGatewayImageProvider } from "@/lib/vega/images/providers/gateway";
import { createOpenAIImageProvider } from "@/lib/vega/images/providers/openai";
import type { ImageProvider } from "@/lib/vega/images/providers/types";

export type { ImageProvider, ImageRequest, ImageResult } from "@/lib/vega/images/providers/types";

export function selectImageProvider(env: Record<string, string | undefined> = process.env): ImageProvider | null {
  const id = imageProvider(env);
  if (!id) return null;
  const model = imageModel(id, env);
  if (id === "openai") return createOpenAIImageProvider(model, env.OPENAI_API_KEY?.trim() ?? "");
  return createGatewayImageProvider(model);
}
