// Base mínima en memoria para probar publicar/despublicar sin Postgres.
type Project = { id: string; userId: string; kind: string; title: string; summary: string; versionCount: number; deletedAt: Date | null };
type Version = { id: string; projectId: string; number: number; generator: string; previewUrl: string | null; previewHtml: string | null; files: unknown; filesUrl: string | null; summary: string };
type Publish = { id: string; projectId: string; slug: string; versionId: string | null; status: string; indexable: boolean; publishedAt: Date | null };

function pick<T extends Record<string, unknown>>(row: T, select?: Record<string, boolean>) {
  if (!select) return row;
  return Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])) as Partial<T>;
}

export function fakePublishDb() {
  const projects: Project[] = [];
  const versions: Version[] = [];
  const publishes: Publish[] = [];
  let seq = 0;
  const db = {
    project: {
      findFirst: async ({ where, select }: { where: Partial<Project>; select?: Record<string, boolean> }) => {
        const row = projects.find((item) => item.id === where.id && (where.userId === undefined || item.userId === where.userId) && (where.deletedAt !== null || item.deletedAt === null));
        return row ? pick(row, select) : null;
      },
    },
    projectVersion: {
      findUnique: async ({ where, select }: { where: { id?: string; projectId_number?: { projectId: string; number: number } }; select?: Record<string, boolean> }) => {
        const row = where.id
          ? versions.find((item) => item.id === where.id)
          : versions.find((item) => item.projectId === where.projectId_number?.projectId && item.number === where.projectId_number?.number);
        return row ? pick(row, select) : null;
      },
    },
    projectPublish: {
      findUnique: async ({ where, select }: { where: { projectId?: string; slug?: string }; select?: Record<string, boolean> }) => {
        const row = publishes.find((item) => (where.projectId ? item.projectId === where.projectId : item.slug === where.slug));
        return row ? pick(row, select) : null;
      },
      upsert: async ({ where, create, update, select }: { where: { projectId: string }; create: Omit<Publish, "id">; update: Partial<Publish>; select?: Record<string, boolean> }) => {
        const clash = publishes.find((item) => item.slug === (update.slug ?? create.slug) && item.projectId !== where.projectId);
        if (clash) throw Object.assign(new Error("unique"), { code: "P2002" });
        let row = publishes.find((item) => item.projectId === where.projectId);
        if (row) Object.assign(row, update);
        else {
          row = { id: `pub${++seq}`, ...create };
          publishes.push(row);
        }
        return pick(row, select);
      },
      updateMany: async ({ where, data }: { where: { projectId: string }; data: Partial<Publish> }) => {
        const rows = publishes.filter((item) => item.projectId === where.projectId);
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
    },
  };
  return {
    db,
    projects,
    versions,
    publishes,
    addProject(input: Partial<Project> & { id: string; userId: string }, versionCount = 2) {
      projects.push({ kind: "sitio", title: "Taquería El Güero", summary: "Tacos al pastor", deletedAt: null, versionCount, ...input });
      for (let number = 1; number <= versionCount; number += 1) {
        versions.push({ id: `${input.id}v${number}`, projectId: input.id, number, generator: "vega-v2", previewUrl: null, previewHtml: `<html><head></head><body>v${number}</body></html>`, files: [], filesUrl: null, summary: "" });
      }
    },
  };
}
