import type { ProjectTableSpec } from "@/lib/project-ui";
import { getPrisma } from "@/lib/prisma";

export type ProjectRowRecord = {
  id: string;
  values: Record<string, string>;
};

export type ProjectRecord = {
  name: string;
  columns: string[];
  rows: ProjectRowRecord[];
};

const physicalPattern = /^p_[a-z0-9]+$/;

let catalogReady: Promise<void> | null = null;

export function physicalName(projectId: string, index: number) {
  const clean = projectId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
  const name = `p_${clean}t${index}`;
  if (!physicalPattern.test(name)) throw new Error("Nombre de tabla inválido.");
  return name;
}

function assertPhysical(physical: string) {
  if (!physicalPattern.test(physical)) throw new Error("Nombre de tabla inválido.");
  return physical;
}

async function ensureCatalog() {
  if (!catalogReady) {
    catalogReady = (async () => {
      const prisma = getPrisma();
      await prisma.$executeRaw`CREATE SCHEMA IF NOT EXISTS projects`;
      await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION lyra_drop_project_table() RETURNS trigger AS $$
        BEGIN
          IF OLD.physical ~ '^p_[a-z0-9]+$' THEN
            EXECUTE format('DROP TABLE IF EXISTS projects.%I', OLD.physical);
          END IF;
          RETURN OLD;
        END;
        $$ LANGUAGE plpgsql
      `);
      await prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'project_table_drop') THEN
            CREATE TRIGGER project_table_drop
            BEFORE DELETE ON "ProjectTable"
            FOR EACH ROW EXECUTE FUNCTION lyra_drop_project_table();
          END IF;
        END $$;
      `);
    })().catch((error: unknown) => {
      catalogReady = null;
      throw error;
    });
  }

  return catalogReady;
}

function columnKeys(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const key = `c${index + 1}`;
    if (!/^c[1-6]$/.test(key)) throw new Error("Columna inválida.");
    return key;
  });
}

async function createPhysicalTable(physical: string, columnCount: number) {
  assertPhysical(physical);
  const columns = columnKeys(columnCount)
    .map((key) => `${key} text NOT NULL DEFAULT ''`)
    .join(", ");
  await getPrisma().$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "projects"."${physical}" (id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), ${columns})`,
  );
}

export async function ensureProjectTables(projectId: string, tables: ProjectTableSpec[]) {
  await ensureCatalog();
  const prisma = getPrisma();
  const existing = await prisma.projectTable.findMany({
    where: { projectId },
    select: { name: true, physical: true, columns: true },
  });
  let nextIndex = existing.length;

  for (const table of tables) {
    if (existing.some((item) => item.name === table.name)) continue;
    const physical = physicalName(projectId, nextIndex);
    nextIndex += 1;
    await createPhysicalTable(physical, table.columns.length);
    await prisma.projectTable.create({
      data: { projectId, name: table.name, physical, columns: table.columns },
    });
    existing.push({ name: table.name, physical, columns: table.columns });
  }

  const records: ProjectRecord[] = [];
  for (const table of existing) {
    if (!tables.some((item) => item.name === table.name)) continue;
    records.push({
      name: table.name,
      columns: table.columns,
      rows: await readRows(table.physical, table.columns),
    });
  }
  return records;
}

async function readRows(physical: string, columns: string[]) {
  assertPhysical(physical);
  const keys = columnKeys(columns.length);
  const rows = await getPrisma().$queryRawUnsafe<Array<Record<string, string>>>(
    `SELECT id, ${keys.join(", ")} FROM "projects"."${physical}" ORDER BY created_at DESC LIMIT 40`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    values: Object.fromEntries(columns.map((column, index) => [column, String(row[keys[index]] ?? "")])),
  }));
}

export async function insertProjectRow(
  userId: string,
  projectId: string,
  tableName: string,
  input: Record<string, string>,
) {
  const table = await getPrisma().projectTable.findFirst({
    where: { projectId, name: tableName, project: { userId } },
    select: { physical: true, columns: true },
  });
  if (!table) return { ok: false as const, error: "Esa tabla no está en el proyecto." };

  const values = Object.fromEntries(
    table.columns.map((column) => [column, typeof input[column] === "string" ? input[column].trim().slice(0, 240) : ""]),
  );
  if (!Object.values(values).some((value) => value.length > 0)) {
    return { ok: false as const, error: "Escribe al menos un dato." };
  }

  assertPhysical(table.physical);
  const keys = columnKeys(table.columns.length);
  const id = crypto.randomUUID();
  const placeholders = keys.map((_, index) => `$${index + 2}`).join(", ");
  await getPrisma().$executeRawUnsafe(
    `INSERT INTO "projects"."${table.physical}" (id, ${keys.join(", ")}) VALUES ($1, ${placeholders})`,
    id,
    ...table.columns.map((column) => values[column] ?? ""),
  );

  return { ok: true as const, row: { id, values } };
}
