// Entrega 2: publicar, despublicar y leer sitios públicos. La base se inyecta para probarlo.
import type { PrismaClient } from "@/generated/prisma/client";
import { hasReadySite } from "@/lib/projects/handoff";
import { isProjectKind } from "@/lib/projects/store";
import { checkSlug } from "@/lib/publish/slug";

export type PublishDb = Pick<PrismaClient, "project" | "projectVersion" | "projectPublish">;

export type PublishView = {
  slug: string;
  status: "draft" | "published" | "unpublished";
  versionNumber: number | null;
  indexable: boolean;
  publishedAt: string | null;
};

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

function statusOf(value: string): PublishView["status"] {
  return value === "published" || value === "unpublished" ? value : "draft";
}

async function ownedProject(db: PublishDb, userId: string, projectId: string) {
  if (typeof projectId !== "string" || !/^[a-z0-9]{10,40}$/i.test(projectId)) return null;
  return db.project.findFirst({ where: { id: projectId, userId, deletedAt: null }, select: { id: true, kind: true, versionCount: true } });
}

export async function getPublishState(db: PublishDb, userId: string, projectId: string): Promise<PublishView | null> {
  const project = await ownedProject(db, userId, projectId);
  if (!project) return null;
  const row = await db.projectPublish.findUnique({ where: { projectId: project.id }, select: { slug: true, status: true, versionId: true, indexable: true, publishedAt: true } });
  if (!row) return null;
  const version = row.versionId ? await db.projectVersion.findUnique({ where: { id: row.versionId }, select: { number: true } }) : null;
  return { slug: row.slug, status: statusOf(row.status), versionNumber: version?.number ?? null, indexable: row.indexable, publishedAt: row.publishedAt?.toISOString() ?? null };
}

/** Publica (o actualiza) un sitio: dirección, versión fija y si se puede indexar. Solo el dueño. */
export async function publishProject(
  db: PublishDb,
  input: { userId: string; projectId: string; slug: unknown; versionNumber: unknown; indexable: unknown },
  now: Date = new Date(),
): Promise<Result<{ publish: PublishView }>> {
  const project = await ownedProject(db, input.userId, input.projectId);
  if (!project) return { ok: false, error: "No encontramos ese proyecto." };
  if (!isProjectKind(project.kind) || !hasReadySite(project.kind)) return { ok: false, error: "Solo se pueden publicar sitios, apps y juegos." };
  const slug = checkSlug(input.slug);
  if (!slug.ok) return { ok: false, error: slug.error };
  const number = typeof input.versionNumber === "number" && Number.isInteger(input.versionNumber) ? input.versionNumber : project.versionCount;
  const version = await db.projectVersion.findUnique({ where: { projectId_number: { projectId: project.id, number } }, select: { id: true, number: true } });
  if (!version) return { ok: false, error: "Esa versión no existe." };
  const taken = await db.projectPublish.findUnique({ where: { slug: slug.slug }, select: { projectId: true } });
  if (taken && taken.projectId !== project.id) return { ok: false, error: "Esa dirección ya la usa otro sitio. Prueba con otra." };
  const indexable = input.indexable === true;
  try {
    const row = await db.projectPublish.upsert({
      where: { projectId: project.id },
      create: { projectId: project.id, slug: slug.slug, versionId: version.id, status: "published", indexable, publishedAt: now },
      update: { slug: slug.slug, versionId: version.id, status: "published", indexable, publishedAt: now },
      select: { slug: true, publishedAt: true },
    });
    return {
      ok: true,
      publish: { slug: row.slug, status: "published", versionNumber: version.number, indexable, publishedAt: row.publishedAt?.toISOString() ?? null },
    };
  } catch (error) {
    if (error && typeof error === "object" && (error as { code?: unknown }).code === "P2002") return { ok: false, error: "Esa dirección ya la usa otro sitio. Prueba con otra." };
    throw error;
  }
}

/** Despublica: la dirección queda apartada para este proyecto, pero deja de servirse. */
export async function unpublishProject(db: PublishDb, input: { userId: string; projectId: string }): Promise<Result<object>> {
  const project = await ownedProject(db, input.userId, input.projectId);
  if (!project) return { ok: false, error: "No encontramos ese proyecto." };
  const updated = await db.projectPublish.updateMany({ where: { projectId: project.id }, data: { status: "unpublished" } });
  return updated.count ? { ok: true } : { ok: false, error: "Este proyecto no estaba publicado." };
}

export type PublishedTarget = {
  projectId: string;
  kind: "sitio" | "app" | "juego";
  slug: string;
  title: string;
  summary: string;
  indexable: boolean;
  version: { id: string; number: number; generator: string; previewUrl: string | null; previewHtml: string | null; files: unknown; filesUrl: string | null };
};

/** Lo que se sirve en /s/[slug]: solo si está publicado y el proyecto existe. */
export async function findPublished(db: PublishDb, rawSlug: string): Promise<PublishedTarget | null> {
  const slug = checkSlug(rawSlug);
  if (!slug.ok) return null;
  const row = await db.projectPublish.findUnique({ where: { slug: slug.slug }, select: { projectId: true, slug: true, status: true, versionId: true, indexable: true } });
  if (!row || row.status !== "published" || !row.versionId) return null;
  const project = await db.project.findFirst({ where: { id: row.projectId, deletedAt: null }, select: { id: true, kind: true, title: true, summary: true } });
  if (!project || !isProjectKind(project.kind) || !hasReadySite(project.kind)) return null;
  const version = await db.projectVersion.findUnique({
    where: { id: row.versionId },
    select: { id: true, number: true, projectId: true, generator: true, previewUrl: true, previewHtml: true, files: true, filesUrl: true, summary: true },
  });
  if (!version || version.projectId !== project.id) return null;
  return {
    projectId: project.id,
    kind: project.kind === "app" ? "app" : project.kind === "juego" ? "juego" : "sitio",
    slug: row.slug,
    title: project.title,
    summary: version.summary || project.summary,
    indexable: row.indexable,
    version: { id: version.id, number: version.number, generator: version.generator, previewUrl: version.previewUrl, previewHtml: version.previewHtml, files: version.files, filesUrl: version.filesUrl },
  };
}
