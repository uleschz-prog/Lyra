import assert from "node:assert/strict";
import test from "node:test";

import { shouldSyncSchema } from "./schema-sync-policy.mjs";

test("solo producción con Postgres sincroniza el esquema", () => {
  assert.equal(
    shouldSyncSchema({ vercelEnv: "production", databaseUrl: "postgresql://db/lyra" }),
    true,
  );
  assert.equal(shouldSyncSchema({ vercelEnv: "preview", databaseUrl: "postgresql://db/lyra" }), false);
  assert.equal(shouldSyncSchema({ vercelEnv: "development", databaseUrl: "postgresql://db/lyra" }), false);
  assert.equal(shouldSyncSchema({ vercelEnv: "", databaseUrl: "postgresql://db/lyra" }), false);
  assert.equal(shouldSyncSchema({ vercelEnv: "production", databaseUrl: "" }), false);
  assert.equal(shouldSyncSchema({ vercelEnv: "production", databaseUrl: "file:./dev.db" }), false);
});
