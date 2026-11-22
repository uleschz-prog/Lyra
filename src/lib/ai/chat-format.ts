// Formato de chat estilo OpenAI (OpenRouter y AI Gateway) <-> partes estilo Gemini que usa Vega.
import type { GeminiContent, GeminiPart } from "@/lib/vega/gemini-stream";

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ChatContentPart[] }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

/** Convierte el historial de Gemini al formato de chat de OpenRouter (estilo OpenAI). */
export function toOpenRouterMessages(system: string, contents: GeminiContent[]): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: system }];
  let pending: { id: string; name: string }[] = [];
  let counter = 0;

  for (const content of contents) {
    if (content.role === "model") {
      const text = content.parts
        .filter((part) => part.text && !part.thought)
        .map((part) => part.text)
        .join("");
      const calls = content.parts
        .filter((part) => part.functionCall)
        .map((part) => ({
          id: `call_${(counter += 1)}`,
          type: "function" as const,
          function: { name: part.functionCall!.name, arguments: JSON.stringify(part.functionCall!.args ?? {}) },
        }));
      pending = calls.map((call) => ({ id: call.id, name: call.function.name }));
      messages.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }

    const userParts: ChatContentPart[] = [];
    for (const part of content.parts) {
      if (part.functionResponse) {
        const index = pending.findIndex((call) => call.name === part.functionResponse!.name);
        const match = index >= 0 ? pending.splice(index, 1)[0] : { id: `call_${(counter += 1)}` };
        messages.push({ role: "tool", tool_call_id: match.id, content: JSON.stringify(part.functionResponse.response) });
      } else if (part.text) {
        userParts.push({ type: "text", text: part.text });
      } else if (part.inlineData) {
        const url = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        if (part.inlineData.mimeType.startsWith("image/")) userParts.push({ type: "image_url", image_url: { url } });
        else if (part.inlineData.mimeType === "application/pdf") userParts.push({ type: "file", file: { filename: "adjunto.pdf", file_data: url } });
        else userParts.push({ type: "text", text: `(Adjunto ${part.inlineData.mimeType} no disponible en el modelo de respaldo.)` });
      }
    }
    if (userParts.length === 1 && userParts[0].type === "text") messages.push({ role: "user", content: userParts[0].text });
    else if (userParts.length > 0) messages.push({ role: "user", content: userParts });
  }
  return messages;
}

export type OpenRouterResponse = {
  model?: string;
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: { function?: { name?: string; arguments?: string } }[];
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
};

/** Convierte la respuesta de OpenRouter en partes estilo Gemini. */
export function fromOpenRouterResponse(payload: OpenRouterResponse): GeminiPart[] {
  const message = payload.choices?.[0]?.message;
  const parts: GeminiPart[] = [];
  if (typeof message?.content === "string" && message.content) parts.push({ text: message.content });
  for (const call of message?.tool_calls ?? []) {
    const name = call.function?.name;
    if (!name) continue;
    let args: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(call.function?.arguments || "{}") as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
    } catch {
      args = {};
    }
    parts.push({ functionCall: { name, args } });
  }
  return parts;
}

/** Alias neutral: el mismo formato sirve para AI Gateway. */
export const toChatMessages = toOpenRouterMessages;
