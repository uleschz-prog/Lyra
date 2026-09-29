import { geminiCredentials } from "@/lib/ai/generate";
import { providerError, readJson } from "@/lib/ai/providers";

export type GeminiPart = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
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

/**
 * Abre la respuesta de Gemini en modo SSE y entrega cada parte tal como llega.
 */
export async function openGeminiStream(system: string, contents: GeminiContent[], tools: FunctionDeclaration[] = []) {
  const { apiKey, model } = geminiCredentials();
  if (!apiKey) return { ok: false as const, error: "Vega no está configurada en el servidor." };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        ...(tools.length > 0 ? { tools: [{ functionDeclarations: tools }] } : {}),
        generationConfig: { temperature: 0.6, maxOutputTokens: 2048 },
      }),
    },
  );

  if (!response.ok || !response.body) {
    const payload = await readJson(response);
    return { ok: false as const, error: providerError(payload, "Vega no pudo responder.") };
  }

  return { ok: true as const, model, parts: streamParts(response.body) };
}

async function* streamParts(body: ReadableStream<Uint8Array>): AsyncGenerator<GeminiPart> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const flush = function* (line: string) {
    if (!line.startsWith("data:")) return;
    try {
      const payload = JSON.parse(line.slice(5).trim()) as { candidates?: { content?: { parts?: GeminiPart[] } }[] };
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
