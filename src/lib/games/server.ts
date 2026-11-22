// Servidor del ranking: resuelve el juego publicado en /s/[slug] y su espacio (sin migraciones).
import { readStoredFiles } from "@/lib/builder/storage";
import { ensureGameSpace, gameSpaceSchema } from "@/lib/games/leaderboard";
import { gameManifestFromFiles } from "@/lib/games/spec";
import { getPrisma } from "@/lib/prisma";
import { cleanProjectFiles } from "@/lib/projects/store";
import { findPublished, type PublishedTarget } from "@/lib/publish/core";

/** Manifiesto del juego en la versión publicada (archivos en la base o en Blob). */
export async function publishedGameManifest(target: PublishedTarget) {
  const raw = target.version.filesUrl ? await readStoredFiles(target.version.filesUrl) : target.version.files;
  const cleaned = cleanProjectFiles(raw);
  return gameManifestFromFiles(cleaned?.files ?? null);
}

/** Espacio activo del ranking del juego publicado (o null si no tiene ranking). */
export async function gameSpaceForTarget(target: PublishedTarget) {
  if (target.kind !== "juego") return null;
  const db = getPrisma();
  const space = await db.appSpace.findUnique({ where: { projectId: target.projectId } });
  const schema = space ? gameSpaceSchema(space.schema) : null;
  if (space && !schema) return null;
  if (space && schema && schema.versionId === target.version.id) return space.status === "active" ? space : null;
  const project = await db.project.findUnique({ where: { id: target.projectId }, select: { userId: true } });
  if (!project) return null;
  const manifest = await publishedGameManifest(target);
  const ensured = await ensureGameSpace(db, { projectId: target.projectId, userId: project.userId, versionId: target.version.id, manifest });
  return ensured && ensured.status === "active" ? ensured : null;
}

export async function gameSpaceForSlug(slug: string) {
  const target = await findPublished(getPrisma(), slug.toLowerCase());
  return target ? gameSpaceForTarget(target) : null;
}
