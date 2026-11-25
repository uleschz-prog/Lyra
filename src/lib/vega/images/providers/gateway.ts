// Proveedor por defecto: Vercel AI Gateway con el AI SDK (misma llave y factura que el chat de Vega).
// - Modelos solo-imagen (openai/gpt-image-*, bfl/flux-*, recraft/*, spacexai/grok-imagine-*): generateImage.
// - Modelos multimodales de Google (google/gemini-*-image): generateText y la imagen llega en `files`.
import { generateImage, generateText } from "ai";

import { sizeFor } from "@/lib/vega/images/config";
import { ImageProviderError } from "@/lib/vega/images/errors";
import type { ImageProvider, ImageRequest, ImageResult } from "@/lib/vega/images/providers/types";

type GenerateImageFn = typeof generateImage;
type GenerateTextFn = typeof generateText;

export function isMultimodalImageModel(model: string) {
  return /^google\/gemini-.*image/i.test(model);
}

function usesSize(model: string) {
  return /^openai\/gpt-image/i.test(model);
}

function numberOrNull(value: unknown) {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** Costo que reporta el Gateway (si lo manda) en providerMetadata.gateway.cost. */
export function gatewayCost(metadata: unknown): number | null {
  const gateway = (metadata as { gateway?: Record<string, unknown> } | undefined)?.gateway;
  return gateway ? numberOrNull(gateway.cost ?? gateway.totalCost) : null;
}

export function createGatewayImageProvider(
  model: string,
  deps: { generateImage?: GenerateImageFn; generateText?: GenerateTextFn } = {},
): ImageProvider {
  const runImage = deps.generateImage ?? generateImage;
  const runText = deps.generateText ?? generateText;

  async function viaImageModel(request: ImageRequest): Promise<ImageResult> {
    const result = await runImage({
      model,
      prompt: request.references.length ? { text: request.prompt, images: request.references.map((item) => item.data) } : request.prompt,
      n: 1,
      ...(usesSize(model) ? { size: sizeFor[request.aspect] } : { aspectRatio: request.aspect }),
      // Calidad de GPT Image; otros modelos la ignoran (llega como advertencia, no como error).
      providerOptions: usesSize(model) ? { openai: { quality: request.quality } } : undefined,
      maxRetries: 0,
      abortSignal: request.abortSignal,
    });
    const image = result.images[0];
    if (!image) throw new ImageProviderError("empty", "sin imágenes en la respuesta");
    const metadata = (result as { providerMetadata?: unknown }).providerMetadata;
    const usage = (result as { usage?: { inputTokens?: number; outputTokens?: number } }).usage;
    return {
      data: image.uint8Array,
      mediaType: image.mediaType || "image/png",
      model: result.responses?.[0]?.modelId ?? model,
      costUsd: gatewayCost(metadata),
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
    };
  }

  async function viaMultimodal(request: ImageRequest): Promise<ImageResult> {
    const result = await runText({
      model,
      messages: [
        {
          role: "user",
          content: [
            ...request.references.map((item) => ({ type: "file" as const, data: item.data, mediaType: item.mediaType })),
            { type: "text" as const, text: request.prompt },
          ],
        },
      ],
      providerOptions: { google: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: request.aspect } } },
      maxRetries: 0,
      abortSignal: request.abortSignal,
    });
    const file = result.files.find((item) => item.mediaType?.startsWith("image/"));
    if (!file) throw new ImageProviderError("empty", `sin imagen; finishReason=${String(result.finishReason)}`);
    return {
      data: file.uint8Array,
      mediaType: file.mediaType,
      model: result.response?.modelId ?? model,
      costUsd: gatewayCost(result.providerMetadata),
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
    };
  }

  return {
    id: "gateway",
    model,
    generate: (request) => (isMultimodalImageModel(model) ? viaMultimodal(request) : viaImageModel(request)),
  };
}
