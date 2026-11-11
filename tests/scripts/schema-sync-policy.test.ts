import { describe, expect, it } from "vitest";

import { shouldSyncSchema } from "../../scripts/schema-sync-policy.mjs";

describe("shouldSyncSchema", () => {
  it("solo producción con Postgres sincroniza el esquema", () => {
    expect(shouldSyncSchema({ vercelEnv: "production", databaseUrl: "postgresql://db/lyra" })).toBe(true);
    expect(shouldSyncSchema({ vercelEnv: "preview", databaseUrl: "postgresql://db/lyra" })).toBe(false);
    expect(shouldSyncSchema({ vercelEnv: "development", databaseUrl: "postgresql://db/lyra" })).toBe(false);
    expect(shouldSyncSchema({ vercelEnv: "", databaseUrl: "postgresql://db/lyra" })).toBe(false);
    expect(shouldSyncSchema({ vercelEnv: "production", databaseUrl: "" })).toBe(false);
    expect(shouldSyncSchema({ vercelEnv: "production", databaseUrl: "file:./dev.db" })).toBe(false);
  });
});
