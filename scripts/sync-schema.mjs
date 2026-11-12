import { spawnSync } from "node:child_process";

import "dotenv/config";

if (!process.env.DATABASE_URL?.startsWith("postgres")) {
  console.error("Configura DATABASE_URL con una conexión PostgreSQL antes de sincronizar el esquema.");
  process.exit(1);
}

const result = spawnSync("npx", ["prisma", "db", "push"], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
