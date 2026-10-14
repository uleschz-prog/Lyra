const secretKey = /api[-_]?key|token|secret|authorization|password|bearer|cookie/i;

export function redactFields(fields: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    output[key] = secretKey.test(key) ? "[redacted]" : value;
  }
  return output;
}

export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Error inesperado.";
  return message.replace(/bearer\s+\S+/gi, "bearer [redacted]").slice(0, 180);
}

export function formatVegaLog(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...redactFields(fields),
  });
}

export function logVega(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  const line = formatVegaLog(level, event, fields);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
