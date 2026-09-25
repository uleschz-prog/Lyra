export function providerError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, unknown>;

  if (typeof record.message === "string" && record.message.trim()) {
    return record.message;
  }

  const error = record.error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }

  const detail = record.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object") {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }

  return fallback;
}

export async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
