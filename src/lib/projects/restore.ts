import { appendProjectVersion, cleanProjectFiles, type ProjectDb } from "@/lib/projects/store";

/** Copia la versión `number` como versión nueva del mismo proyecto. Solo el dueño; idempotente por `requestKey`. */
export async function restoreProjectVersion(
  db: ProjectDb,
  input: { userId: string; projectId: string; number: number; requestKey: string },
): Promise<{ ok: true; versionNumber: number } | { ok: false; error: string }> {
  if (!Number.isInteger(input.number) || input.number < 1) return { ok: false, error: "Esa versión no existe." };
  if (!/^[a-z0-9-]{8,64}$/i.test(input.requestKey)) return { ok: false, error: "Solicitud no válida." };
  const project = await db.project.findFirst({ where: { id: input.projectId, userId: input.userId, deletedAt: null }, select: { id: true, versionCount: true } });
  if (!project) return { ok: false, error: "No encontramos ese proyecto." };
  if (input.number === project.versionCount) return { ok: false, error: "Esa ya es la versión más reciente." };
  const version = await db.projectVersion.findUnique({
    where: { projectId_number: { projectId: project.id, number: input.number } },
    select: { title: true, files: true, filesUrl: true, previewUrl: true, previewHtml: true, generator: true, sizeBytes: true },
  });
  if (!version) return { ok: false, error: "Esa versión no existe." };
  // Los archivos en Blob se comparten por URL (nunca se borran); los de la base se copian.
  const files = version.filesUrl ? [] : (cleanProjectFiles(version.files)?.files ?? []);
  if (!version.filesUrl && !files.length) return { ok: false, error: "Esa versión no tiene archivos para restaurar." };
  const saved = await appendProjectVersion(db, {
    userId: input.userId,
    projectId: project.id,
    actionId: `restore:${project.id}:${input.requestKey}`,
    title: version.title,
    summary: `Restaurada desde la versión ${input.number}.`,
    files,
    suggestions: [],
    bytes: version.sizeBytes,
    generator: version.generator,
    filesUrl: version.filesUrl,
    previewUrl: version.previewUrl,
    previewHtml: version.previewHtml,
  });
  return saved ? { ok: true, versionNumber: saved.versionNumber } : { ok: false, error: "No se pudo restaurar. Intenta de nuevo." };
}
