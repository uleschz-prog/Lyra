import { getEncoding, type Tiktoken } from "js-tiktoken";

let encoding: Tiktoken | null = null;

/** cl100k es una estimación. Grok, Llama y Claude no comparten ese tokenizador. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  encoding ??= getEncoding("cl100k_base");
  return encoding.encode(text).length;
}

export function estimateMessageTokens(messages: Array<{ content: string }>): number {
  return estimateTokens(messages.map((message) => message.content).join("\n"));
}
