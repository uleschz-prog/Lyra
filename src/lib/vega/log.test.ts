import assert from "node:assert/strict";
import test from "node:test";

import { formatVegaLog, redactFields, safeErrorMessage } from "./log";

test("el log estructurado no imprime secretos", () => {
  const line = formatVegaLog("info", "vega.llm.ok", {
    userId: "user-1",
    apiKey: "sk-live",
    token: "abc",
    keyword: "lyra",
    authorization: "Bearer real",
  });
  const parsed = JSON.parse(line) as Record<string, unknown>;
  assert.equal(parsed.userId, "user-1");
  assert.equal(parsed.keyword, "lyra");
  assert.equal(parsed.apiKey, "[redacted]");
  assert.equal(parsed.token, "[redacted]");
  assert.equal(parsed.authorization, "[redacted]");
  assert.equal(line.includes("sk-live"), false);
  assert.equal(line.includes("Bearer real"), false);
});

test("un mensaje de error pierde el bearer y se recorta", () => {
  const error = new Error(`falló bearer super-secret-value ${"x".repeat(300)}`);
  const message = safeErrorMessage(error);
  assert.equal(message.includes("super-secret-value"), false);
  assert.match(message, /bearer \[redacted\]/);
  assert.ok(message.length <= 180);
});

test("redactFields no toca campos de negocio", () => {
  assert.deepEqual(redactFields({ feature: "vega.crisis", budgetUsd: 1.45 }), {
    feature: "vega.crisis",
    budgetUsd: 1.45,
  });
});
