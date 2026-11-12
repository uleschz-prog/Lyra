import { getPrisma } from "@/lib/prisma";
import { cleanProjectFiles, isProjectKind } from "@/lib/projects/store";
import type { ProjectFile, ProjectKind } from "@/lib/vega/build-project";

export type ProjectListItem = {
  id: string;
  kind: ProjectKind;
  title: string;
  summary: string;
  versionCount: number;
  updatedAt: string;
};

export type ProjectVersionItem = { number: number; title: string; summary: string; sizeBytes: number; createdAt: string };

export type ProjectDetail = ProjectListItem & { createdAt: string; versions: ProjectVersionItem[] };

export async function listProjects(userId: string): Promise<ProjectListItem[]> {
  const rows = await getPrisma().project.findMany({
    where: { userId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: { id: true, kind: true, title: true, summary: true, versionCount: true, updatedAt: true },
  });
  return rows.flatMap((row) =>
    isProjectKind(row.kind) && row.versionCount > 0
      ? [{ ...row, kind: row.kind, updatedAt: row.updatedAt.toISOString() }]
      : [],
  );
}

export async function getProject(userId: string, id: string): Promise<ProjectDetail | null> {
  const row = await getPrisma().project.findFirst({
    where: { id, userId, deletedAt: null },
    select: {
      id: true,
      kind: true,
      title: true,
      summary: true,
      versionCount: true,
      createdAt: true,
      updatedAt: true,
      versions: {
        orderBy: { number: "desc" },
        select: { number: true, title: true, summary: true, sizeBytes: true, createdAt: true },
      },
    },
  });
  if (!row || !isProjectKind(row.kind)) return null;
  return {
    ...row,
    kind: row.kind,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    versions: row.versions.map((version) => ({ ...version, createdAt: version.createdAt.toISOString() })),
  };
}

/** Archivos de una versión (la última si no se indica). Solo del dueño y si el proyecto no está borrado. */
export async function getProjectVersionFiles(
  userId: string,
  projectId: string,
  number?: number,
): Promise<{ title: string; number: number; files: ProjectFile[] } | null> {
  const project = await getPrisma().project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
    select: { id: true, versionCount: true },
  });
  if (!project) return null;
  const wanted = number && Number.isInteger(number) && number > 0 ? number : project.versionCount;
  const version = await getPrisma().projectVersion.findUnique({
    where: { projectId_number: { projectId: project.id, number: wanted } },
    select: { title: true, number: true, files: true },
  });
  if (!version) return null;
  const cleaned = cleanProjectFiles(version.files);
  return cleaned ? { title: version.title, number: version.number, files: cleaned.files } : null;
}

export function parseVersionParam(value: string | null | undefined) {
  if (!value) return undefined;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number < 100_000 ? number : undefined;
}
