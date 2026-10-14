import assert from "node:assert/strict";
import test from "node:test";

import { parseCompetitorUsernames, parseListeningInput, parseScheduleInput } from "./input";

test("los usuarios de X se normalizan y se rechaza una lista inválida", () => {
  const parsed = parseCompetitorUsernames({ usernames: ["@Acme", "acme", "beta_1"] });
  assert.deepEqual(parsed, { ok: true, usernames: ["acme", "beta_1"] });
  assert.equal(parseCompetitorUsernames({ usernames: [] }).ok, false);
  assert.equal(parseCompetitorUsernames({ usernames: ["tiene espacios"] }).ok, false);
  assert.equal(parseCompetitorUsernames({ usernames: Array.from({ length: 11 }, (_, index) => `u${index}`) }).ok, false);
});

test("escuchar y programar validan la entrada", () => {
  assert.deepEqual(parseListeningInput({ keywords: [" Lyra "], competitors: ["@Acme"] }), {
    ok: true,
    keywords: ["lyra"],
    competitors: ["acme"],
  });
  assert.equal(parseListeningInput({}).ok, false);
  assert.equal(parseScheduleInput({ cadence: "WEEKLY", enabled: true }).ok, true);
  assert.equal(parseScheduleInput({ cadence: "mensual", enabled: true }).ok, false);
});
