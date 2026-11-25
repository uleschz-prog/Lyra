// Alternativa: API de imágenes de OpenAI directa (OPENAI_API_KEY). Otra factura y otra llave que el Gateway.
// Usa POST /v1/images/generations (sin referencias) o /v1/images/edits (con referencias, multipart).
import { isStoryAspect, sizeFor } from "@/lib/vega/images/config";
import { ImageProviderError } from "@/lib/vega/images/errors";
import type { ImageProvider, ImageRequest, ImageResult } from "@/lib/vega/images/providers/types";

type OpenAIImageResponse = {
  data?: { b64_json?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string; code?: string; type?: string };
};

const baseUrl = "https://api.openai.com/v1/images";

export function createOpenAIImageProvider(model: string, apiKey: string, fetcher: typeof fetch = fetch): ImageProvider {
  async function call(request: ImageRequest): Promise<Response> {
    if (isStoryAspect(request.aspect)) throw new ImageProviderError("invalid", `OpenAI no tiene el formato ${request.aspect}`);
    const size = sizeFor[request.aspect];
    const headers = { Authorization: `Bearer ${apiKey}` };
    if (!request.references.length) {
      return fetcher(`${baseUrl}/generations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: request.prompt, size, quality: request.quality, n: 1 }),
        signal: request.abortSignal,
      });
    }
    const form = new FormData();
    form.set("model", model);
    form.set("prompt", request.prompt);
    form.set("size", size);
    form.set("quality", request.quality);
    request.references.forEach((item, index) => {
      const extension = item.mediaType.split("/")[1] ?? "png";
      form.append("image[]", new Blob([item.data as BlobPart], { type: item.mediaType }), `referencia-${index + 1}.${extension}`);
    });
    return fetcher(`${baseUrl}/edits`, { method: "POST", headers, body: form, signal: request.abortSignal });
  }

  return {
    id: "openai",
    model,
    async generate(request): Promise<ImageResult> {
      const response = await call(request);
      const body = (await response.json().catch(() => ({}))) as OpenAIImageResponse;
      if (!response.ok) {
        const message = `${body.error?.code ?? ""} ${body.error?.type ?? ""} ${body.error?.message ?? ""}`.trim();
        throw Object.assign(new Error(message || `HTTP ${response.status}`), { name: "OpenAIImageError", statusCode: response.status });
      }
      const encoded = body.data?.[0]?.b64_json;
      if (!encoded) throw new ImageProviderError("empty", "OpenAI no devolvió b64_json");
      return {
        data: new Uint8Array(Buffer.from(encoded, "base64")),
        mediaType: "image/png",
        model,
        costUsd: null,
        inputTokens: body.usage?.input_tokens ?? null,
        outputTokens: body.usage?.output_tokens ?? null,
      };
    },
  };
}
