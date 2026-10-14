import type { ModelPrice, TransportResult } from "./types";

export type AttemptClass = "ok" | "retry" | "abort" | "skip";

export function backoffMs(retryIndex: number, random: () => number, baseMs = 200, capMs = 5_000): number {
  const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, retryIndex));
  const unit = Math.min(1, Math.max(0, random()));
  return Math.round(exp * (0.5 + unit));
}

export function hasBodyError(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const error = (body as { error?: unknown }).error;
  if (error == null) return false;
  if (typeof error === "string") return error.trim().length > 0;
  return typeof error === "object";
}

export function extractAssistantText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  if (hasBodyError(body)) return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (!first || typeof first !== "object") return null;
  const content = (first as { message?: { content?: unknown } }).message?.content;
  if (typeof content !== "string") return null;
  const trimmed = content.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function classifyAttempt(result: TransportResult): AttemptClass {
  if (result.timedOut || result.networkError) return "retry";
  if (result.status === 401 || result.status === 403) return "abort";
  if (result.status === 429 || result.status === 0 || result.status >= 500) return "retry";
  if (result.status >= 400 && result.status < 500) return "skip";
  if (result.status === 200) {
    if (hasBodyError(result.body) || !extractAssistantText(result.body)) return "retry";
    return "ok";
  }
  return "retry";
}

export function worstCaseCost(promptTokens: number, maxTokens: number, price: ModelPrice): number {
  return promptTokens * price.promptPerToken + maxTokens * price.completionPerToken;
}

export function usageCost(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const cost = (body as { usage?: { cost?: unknown } }).usage?.cost;
  if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0) return null;
  return cost;
}

export function tokenCounts(body: unknown): { prompt: number | null; completion: number | null } {
  if (!body || typeof body !== "object") return { prompt: null, completion: null };
  const usage = (body as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } }).usage;
  const prompt = usage?.prompt_tokens;
  const completion = usage?.completion_tokens;
  return {
    prompt: typeof prompt === "number" && Number.isFinite(prompt) && prompt >= 0 ? prompt : null,
    completion: typeof completion === "number" && Number.isFinite(completion) && completion >= 0 ? completion : null,
  };
}

export function calculatedCost(
  body: unknown,
  price: ModelPrice,
  estimatedPrompt: number,
  estimatedCompletion: number,
): number {
  const counts = tokenCounts(body);
  const prompt = counts.prompt ?? estimatedPrompt;
  const completion = counts.completion ?? estimatedCompletion;
  return prompt * price.promptPerToken + completion * price.completionPerToken;
}
