import assert from "node:assert/strict";
import test from "node:test";

import { embedText, toPointId, VEGA_VECTOR_SIZE } from "./embed";
import { createQdrantMemory, historyPoint } from "./qdrant";

test("el vector local es determinista y queda normalizado", () => {
  const first = embedText("lyra mercado");
  assert.deepEqual(first, embedText("lyra mercado"));
  assert.equal(first.length, VEGA_VECTOR_SIZE);
  const norm = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));
  assert.ok(Math.abs(norm - 1) < 1e-9);
  assert.notDeepEqual(first, embedText("otro tema"));
  assert.equal(toPointId("post-1"), toPointId("post-1"));
  assert.notEqual(toPointId("post-1"), toPointId("post-2"));
});

test("Qdrant se mockea: crea la colección una vez y filtra por usuario", async () => {
  const upserts: unknown[] = [];
  const queries: unknown[] = [];
  let creates = 0;
  const memory = createQdrantMemory({
    collectionExists: async () => ({ exists: creates > 0 }),
    createCollection: async () => {
      creates += 1;
    },
    upsert: async (_name, body) => {
      upserts.push(body.points);
    },
    query: async (_name, body) => {
      queries.push(body);
      return { points: [{ id: "p1", score: 0.8, payload: { text: "histórico", author: "acme", postedAt: "2026-10-14T00:00:00.000Z" } }] };
    },
  });

  const point = historyPoint({
    userId: "user-1",
    profileId: "profile-1",
    externalId: "99",
    text: "histórico de lyra",
    author: "acme",
    postedAt: "2026-10-14T00:00:00.000Z",
  });
  await memory.upsert([point]);
  await memory.upsert([point]);
  const hits = await memory.search(point.vector, 3, "user-1");
  assert.equal(creates, 1);
  assert.equal(upserts.length, 2);
  assert.equal(hits[0]?.text, "histórico");
  assert.deepEqual((queries[0] as { filter: unknown }).filter, { must: [{ key: "userId", match: { value: "user-1" } }] });
});
