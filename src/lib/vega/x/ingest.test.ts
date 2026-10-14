import assert from "node:assert/strict";
import test from "node:test";

import { XRateLimitError, parseRecentSearch, searchRecent } from "./client";
import { runSharedIngest, type Listener } from "./ingest";
import { collectTerms, packQueries } from "./query";

const now = new Date("2026-10-14T12:00:00.000Z");

const listeners: Listener[] = [
  { profileId: "p1", userId: "user-aaaa", packageId: "FOUNDER", keywords: ["lyra"], competitors: [] },
  { profileId: "p2", userId: "user-bbbb", packageId: "CORPORATE", keywords: ["lyra"], competitors: ["acme"] },
  { profileId: "p3", userId: "user-cccc", packageId: "FOUNDER", keywords: ["vega"], competitors: [] },
  { profileId: "p4", userId: "user-dddd", packageId: "FOUNDER", keywords: ["lyra"], competitors: [] },
];

function negative(id: string) {
  return {
    externalId: id,
    author: "acme",
    text: "esto es una estafa horrible de lyra",
    postedAt: new Date(now.getTime() - 60_000),
    hashtags: ["lyra"],
  };
}

test("varias cuentas comparten una consulta y el resultado se reparte", async () => {
  const calls: string[] = [];
  let explains = 0;
  const saved: string[] = [];
  const result = await runSharedIngest({
    listeners,
    search: async (query) => {
      calls.push(query);
      return [negative("1"), negative("2"), negative("3"), negative("4"), negative("5")];
    },
    existingExternalIds: async () => new Set(),
    save: async (posts) => {
      saved.push(...posts.map((post) => post.externalId));
    },
    recentSentiments: async () => [],
    hasOpenAlert: async () => false,
    createAlert: async () => "alert-1",
    setAlertSummary: async () => undefined,
    explain: async () => {
      explains += 1;
      return "Resumen de crisis.";
    },
    now,
    crisis: { threshold: 0.6, windowMs: 60 * 60 * 1000, minPosts: 5 },
  });

  assert.equal(calls.length, 1);
  assert.ok(calls.length < listeners.length);
  for (const listener of listeners) assert.equal(calls[0]?.includes(listener.userId), false);
  assert.match(calls[0] ?? "", /lyra/);
  assert.match(calls[0] ?? "", /from:acme/);
  assert.equal(saved.length, 5);
  assert.equal(result.matches, 15);
  assert.equal(result.alerts, 3);
  assert.equal(explains, 3);
});

test("sin cruce de umbral no se llama al LLM", async () => {
  let explains = 0;
  const result = await runSharedIngest({
    listeners: [listeners[0]!],
    search: async () => [
      {
        externalId: "ok",
        author: "alguien",
        text: "excelente servicio recomendado de lyra",
        postedAt: now,
        hashtags: [],
      },
    ],
    existingExternalIds: async () => new Set(),
    save: async () => undefined,
    recentSentiments: async () => [],
    hasOpenAlert: async () => false,
    createAlert: async () => "alert",
    setAlertSummary: async () => undefined,
    explain: async () => {
      explains += 1;
      return "no";
    },
    now,
  });
  assert.equal(explains, 0);
  assert.equal(result.alerts, 0);
});

test("una alerta abierta no vuelve a pedir resumen", async () => {
  let created = 0;
  let explains = 0;
  await runSharedIngest({
    listeners: [listeners[0]!],
    search: async () => [negative("1"), negative("2"), negative("3"), negative("4"), negative("5")],
    existingExternalIds: async () => new Set(),
    save: async () => undefined,
    recentSentiments: async () => [],
    hasOpenAlert: async () => true,
    createAlert: async () => {
      created += 1;
      return "alert";
    },
    setAlertSummary: async () => undefined,
    explain: async () => {
      explains += 1;
      return "otra vez";
    },
    now,
    crisis: { threshold: 0.6, windowMs: 60 * 60 * 1000, minPosts: 5 },
  });
  assert.equal(created, 0);
  assert.equal(explains, 0);
});

test("el límite de la X API detiene el resto de consultas compartidas", async () => {
  const calls: string[] = [];
  const result = await runSharedIngest({
    listeners,
    search: async (query) => {
      calls.push(query);
      if (calls.length === 2) throw new XRateLimitError();
      return [negative(String(calls.length))];
    },
    existingExternalIds: async () => new Set(),
    save: async () => undefined,
    recentSentiments: async () => [],
    hasOpenAlert: async () => false,
    createAlert: async () => "alert",
    setAlertSummary: async () => undefined,
    explain: async () => null,
    now,
    pack: { maxChars: 30, maxQueries: 3 },
  });
  assert.equal(result.rateLimited, true);
  assert.equal(calls.length, 2);
});

test("los términos se empacan una vez y lo que no cabe queda diferido", () => {
  const terms = collectTerms(listeners);
  assert.equal(new Set(terms).size, terms.length);
  assert.equal(terms.filter((term) => term === "lyra").length, 1);
  const packed = packQueries(["alphaone", "betatwo", "gammathree"], { maxChars: 30, maxQueries: 1 });
  assert.equal(packed.queries.length, 1);
  assert.equal(packed.deferred, 2);
});

test("el cliente de X parsea el recent search y manda una sola petición", async () => {
  const parsed = parseRecentSearch({
    data: [{ id: "99", text: "hola #Lyra", author_id: "u1", created_at: "2026-10-14T00:00:00.000Z", entities: { hashtags: [{ tag: "Lyra" }] } }],
    includes: { users: [{ id: "u1", username: "Acme" }] },
  });
  assert.equal(parsed[0]?.author, "acme");
  assert.deepEqual(parsed[0]?.hashtags, ["lyra"]);

  let calls = 0;
  const posts = await searchRecent("lyra", {
    token: "test-token",
    fetch: async (input, init) => {
      calls += 1;
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers.authorization, "Bearer test-token");
      assert.match(String(input), /query=lyra/);
      return new Response(JSON.stringify({ data: [], includes: { users: [] } }), { status: 200 });
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(posts, []);
});
