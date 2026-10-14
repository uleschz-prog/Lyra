import assert from "node:assert/strict";
import test from "node:test";

import { openRouterTransport } from "./transport";

test("OpenRouter pide usage.cost y no devuelve la clave en el resultado", async () => {
  let auth = "";
  let body: Record<string, unknown> = {};
  const fetchImpl: typeof fetch = async (_url, init) => {
    const headers = init?.headers as Record<string, string>;
    auth = headers.authorization;
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ message: { content: "hola" } }], usage: { cost: 0.01 } }), { status: 200 });
  };

  const result = await openRouterTransport(
    { model: "modelo", messages: [{ role: "user", content: "hola" }], maxTokens: 16, temperature: 0.2 },
    { fetch: fetchImpl, apiKey: "test-key", timeoutMs: 1000 },
  );

  assert.equal(auth, "Bearer test-key");
  assert.deepEqual(body.usage, { include: true });
  assert.equal(result.status, 200);
  assert.equal(JSON.stringify(result).includes("test-key"), false);
});

test("un aborto del cliente cuenta como timeout reintentable", async () => {
  const fetchImpl: typeof fetch = async () => {
    const error = new Error("abort");
    error.name = "AbortError";
    throw error;
  };
  const result = await openRouterTransport(
    { model: "modelo", messages: [{ role: "user", content: "hola" }], maxTokens: 16, temperature: 0 },
    { fetch: fetchImpl, apiKey: "test-key", timeoutMs: 1000 },
  );
  assert.equal(result.timedOut, true);
  assert.equal(result.status, 0);
});
