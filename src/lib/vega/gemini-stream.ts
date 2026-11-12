import { geminiCredentials } from "@/lib/ai/generate";
import { providerError, readJson } from "@/lib/ai/providers";
import type { ModelUsage } from "@/lib/vega/usage";

export type GeminiPart = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
};

export type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

export type FunctionDeclaration = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export function vegaConfigured() {
  return Boolean(geminiCredentials().apiKey);
}

/** `model` reemplaza el modelo configurado (p. ej. uno más barato cerca del tope de costo). */
export type StreamOptions = { signal?: AbortSignal; model?: string };

/**
 * Abre la respuesta de Gemini en modo SSE y entrega cada parte tal como llega.
 * `usage` se llena con el uso de tokens cuando termina el stream.
 */
export async function openGeminiStream(
  system: string,
  contents: GeminiContent[],
  tools: FunctionDeclaration[] = [],
  options: StreamOptions = {},
) {
  const credentials = geminiCredentials();
  const apiKey = credentials.apiKey;
  const model = options.model?.trim() || credentials.model;
  if (!apiKey) return { ok: false as const, status: 0, error: "Vega no está configurada en el servidor." };

  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          ...(tools.length > 0 ? { tools: [{ functionDeclarations: tools }] } : {}),
          generationConfig: { temperature: 0.6, maxOutputTokens: 4096 },
        }),
        signal: options.signal,
      },
    );
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false as const, status: aborted ? 408 : 0, error: aborted ? "Gemini tardó demasiado." : "No se pudo contactar a Gemini." };
  }

  if (!response.ok || !response.body) {
    const payload = await readJson(response);
    return { ok: false as const, status: response.status, error: providerError(payload, "Vega no pudo responder.") };
  }

  const usage: ModelUsage = { provider: "gemini", model, inputTokens: 0, outputTokens: 0, reportedCostUsd: null };
  return { ok: true as const, provider: "gemini" as const, model, usage, parts: streamParts(response.body, usage) };
}

type UsageMetadata = { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };

async function* streamParts(body: ReadableStream<Uint8Array>, usage?: ModelUsage): AsyncGenerator<GeminiPart> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const flush = function* (line: string) {
    if (!line.startsWith("data:")) return;
    try {
      const payload = JSON.parse(line.slice(5).trim()) as {
        candidates?: { content?: { parts?: GeminiPart[] } }[];
        usageMetadata?: UsageMetadata;
      };
      if (usage && payload.usageMetadata) {
        // Cada fragmento trae el acumulado; el último es el total.
        usage.inputTokens = payload.usageMetadata.promptTokenCount ?? usage.inputTokens;
        usage.outputTokens = (payload.usageMetadata.candidatesTokenCount ?? 0) + (payload.usageMetadata.thoughtsTokenCount ?? 0);
      }
      for (const part of payload.candidates?.[0]?.content?.parts ?? []) yield part;
    } catch {
      return;
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      yield* flush(line);
    }
  }
  yield* flush(buffer.trim());
}
