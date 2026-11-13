import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// El esquema de producción solo cambia con `prisma migrate deploy` y migraciones aditivas.
// `prisma db push` lo escribía por fuera del historial y podía apuntar a la base real.
const root = process.cwd();
const dbPush = /db\s+push|accept-data-loss|force-reset|sync-schema/i;

describe("sin prisma db push", () => {
  it("ya no existe scripts/sync-schema.mjs", () => {
    expect(existsSync(join(root, "scripts/sync-schema.mjs"))).toBe(false);
  });

  it("package.json no tiene db:sync ni ningún script con db push", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["db:sync"]).toBeUndefined();
    for (const command of Object.values(pkg.scripts)) expect(command).not.toMatch(dbPush);
  });

  it("el build de Vercel solo usa baseline + migrate deploy", () => {
    const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as { buildCommand?: string };
    expect(vercel.buildCommand ?? "").not.toMatch(dbPush);
    expect(vercel.buildCommand ?? "").toMatch(/prisma migrate deploy/);
  });

  it("ningún script de scripts/ llama a db push", () => {
    for (const name of readdirSync(join(root, "scripts"))) {
      expect(readFileSync(join(root, "scripts", name), "utf8"), name).not.toMatch(/["'\s]db["',\s]+["']?push|accept-data-loss|force-reset/);
    }
  });
});
