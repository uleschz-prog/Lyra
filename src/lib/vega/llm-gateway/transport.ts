import type { TransportRequest, TransportResult } from "./types";

const COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function openRouterTransport(
  request: TransportRequest,
  deps: { fetch: typeof fetch; apiKey: string; timeoutMs: number; referer?: string },
): Promise<TransportResult> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${deps.apiKey}`,
    "content-type": "application/json",
    "x-title": "Lyra Vega",
  };
  if (deps.referer) headers["http-referer"] = deps.referer;

  try {
    const response = await deps.fetch(COMPLETIONS_URL, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(deps.timeoutMs),
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        usage: { include: true },
      }),
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const timedOut = name === "AbortError" || name === "TimeoutError";
    return { status: 0, body: null, timedOut, networkError: !timedOut };
  }
}
