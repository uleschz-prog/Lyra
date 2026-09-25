import { spawnSync } from "node:child_process";

import { shouldSyncSchema } from "./schema-sync-policy.mjs";

const vercelEnv = process.env.VERCEL_ENV ?? "";
const databaseUrl = process.env.DATABASE_URL ?? "";

if (!shouldSyncSchema({ vercelEnv, databaseUrl })) {
  const reason =
    vercelEnv !== "production"
      ? `VERCEL_ENV=${vercelEnv || "local"} no es production`
      : "DATABASE_URL no es Postgres";
  console.log(
    `Sincronización de esquema omitida (${reason}). Los builds de preview y local no modifican la base compartida.`,
  );
  process.exit(0);
}

console.log("Sincronizando esquema aditivo en la base de producción (sin --accept-data-loss).");

const result = spawnSync("npx", ["prisma", "db", "push", "--skip-generate"], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
