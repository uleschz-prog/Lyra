import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// El build de producción corre `prisma migrate deploy` contra la base real.
// Desde la Fase 1, las migraciones nuevas solo pueden agregar.
const since = "20261111";
const destructive = /\b(DROP\s+(TABLE|COLUMN|TYPE|INDEX|CONSTRAINT|SCHEMA)|RENAME\s|TRUNCATE\b|DELETE\s+FROM\b)/i;

describe("migraciones aditivas", () => {
  const dir = join(process.cwd(), "prisma/migrations");
  const recent = readdirSync(dir).filter((name) => /^\d{14}_/.test(name) && name >= since);

  it("hay al menos una migración de la Fase 1", () => {
    expect(recent.length).toBeGreaterThan(0);
  });

  it.each(recent)("%s no borra ni renombra nada", (name) => {
    const sql = readFileSync(join(dir, name, "migration.sql"), "utf8").replace(/--.*$/gm, "");
    expect(sql).not.toMatch(destructive);
  });
});
