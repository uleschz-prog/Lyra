import assert from "node:assert/strict";
import test from "node:test";

import { authorizeCron } from "./cron-auth";

test("el cron exige el secreto en el encabezado Bearer", () => {
  assert.equal(authorizeCron("Bearer cron-secret", "cron-secret"), true);
  assert.equal(authorizeCron("Bearer otro", "cron-secret"), false);
  assert.equal(authorizeCron(null, "cron-secret"), false);
  assert.equal(authorizeCron("Bearer cron-secret", undefined), false);
  assert.equal(authorizeCron("Bearer ", ""), false);
});
