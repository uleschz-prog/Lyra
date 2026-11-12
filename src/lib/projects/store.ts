import type { PrismaClient } from "@/generated/prisma/client";
import type { ProjectDraft, ProjectFile, ProjectKind } from "@/lib/vega/build-project";

/** Proyectos (PR B): cada entrega de Vega se guarda como una versión del proyecto del socio. */

export type ProjectDb = Pick<PrismaClient, "project" | "projectVersion">;

export const projectKinds: readonly ProjectKind[] = ["sitio", "app", "agente"];
export const projectKindLabels: Record<ProjectKind, string> = { sitio: "Sitio web", app: "App", agente: "Agente" };

/** Tope por versión (los archivos viven en la base por ahora). */
export const maxProjectVersionBytes = 1_500_000;
const maxFiles = 60;

export function isProjectKind(value: unknown): value is ProjectKind {
  return typeof value === "string" && (projectKinds as readonly string[]).includes(value);
}

export function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 80);
}

/** Misma conversación + mismo tipo + mismo título = nueva versión del mismo proyecto. */
export function projectGroupKey(conversationId: string | null, kind: ProjectKind, title: string) {
  return `${conversationId ?? "sin-chat"}:${kind}:${normalizeTitle(title) || "proyecto"}`;
}

export function zipFileName(title: string, number: number) {
  const base =
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "proyecto";
  return `${base}-v${number}.zip`;
}

function safePath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    path.length <= 200 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.split("/").some((part) => part === "" || part === "." || part === "..")
  );
}

/** Valida los archivos: rutas relativas seguras, texto, sin duplicados y dentro del tope. */
export function cleanProjectFiles(value: unknown): { files: ProjectFile[]; bytes: number } | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxFiles) return null;
  const files: ProjectFile[] = [];
  const seen = new Set<string>();
  let bytes = 0;
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const { path, content } = item as { path?: unknown; content?: unknown };
    if (!safePath(path) || typeof content !== "string" || seen.has(path)) return null;
    seen.add(path);
    bytes += Buffer.byteLength(content, "utf8");
    files.push({ path, content });
  }
  if (bytes > maxProjectVersionBytes) return null;
  return { files, bytes };
}

/** Lee una entrega guardada (payload de VegaAction) y la vuelve un borrador válido. */
export function draftFromPayload(payload: unknown): (ProjectDraft & { bytes: number }) | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as Record<string, unknown>;
  if (!isProjectKind(raw.kind)) return null;
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 80) : "";
  if (title.length < 2) return null;
  const cleaned = cleanProjectFiles(raw.files);
  if (!cleaned) return null;
  const suggestions = Array.isArray(raw.suggestions)
    ? raw.suggestions.filter((item): item is string => typeof item === "string").slice(0, 5)
    : [];
  return {
    kind: raw.kind,
    title,
    summary: typeof raw.summary === "string" ? raw.summary.slice(0, 600) : "",
    files: cleaned.files,
    suggestions,
    bytes: cleaned.bytes,
  };
}

function isUniqueError(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "P2002");
}

export type SavedProject = { projectId: string; versionNumber: number; created: boolean };

/**
 * Guarda una entrega de Vega en Proyectos. Idempotente por `actionId`:
 * la misma entrega nunca se guarda dos veces.
 */
export async function saveDeliveredProject(
  db: ProjectDb,
  input: { userId: string; conversationId: string | null; actionId: string; payload: unknown },
): Promise<SavedProject | null> {
  const draft = draftFromPayload(input.payload);
  if (!draft) return null;

  const existing = await db.projectVersion.findUnique({
    where: { sourceActionId: input.actionId },
    select: { projectId: true, number: true },
  });
  if (existing) return { projectId: existing.projectId, versionNumber: existing.number, created: false };

  const groupKey = projectGroupKey(input.conversationId, draft.kind, draft.title);
  let project = await db.project.findFirst({
    where: { userId: input.userId, groupKey, deletedAt: null },
    select: { id: true, versionCount: true },
  });
  const created = !project;
  if (!project) {
    project = await db.project.create({
      data: {
        userId: input.userId,
        kind: draft.kind,
        title: draft.title,
        summary: draft.summary,
        groupKey,
        conversationId: input.conversationId,
        versionCount: 0,
      },
      select: { id: true, versionCount: true },
    });
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await db.project.findUnique({ where: { id: project.id }, select: { versionCount: true } });
    const number = (current?.versionCount ?? project.versionCount) + 1;
    try {
      await db.projectVersion.create({
        data: {
          projectId: project.id,
          number,
          title: draft.title,
          summary: draft.summary,
          files: draft.files,
          suggestions: draft.suggestions,
          sizeBytes: draft.bytes,
          generator: "vega-v1",
          sourceActionId: input.actionId,
        },
        select: { id: true },
      });
      await db.project.update({
        where: { id: project.id },
        data: { versionCount: number, title: draft.title, summary: draft.summary },
        select: { id: true },
      });
      return { projectId: project.id, versionNumber: number, created };
    } catch (error) {
      if (!isUniqueError(error)) throw error;
      // Otra petición guardó la misma entrega o tomó ese número: se revisa y se reintenta.
      const again = await db.projectVersion.findUnique({
        where: { sourceActionId: input.actionId },
        select: { projectId: true, number: true },
      });
      if (again) return { projectId: again.projectId, versionNumber: again.number, created: false };
    }
  }
  return null;
}

/** Trae a Proyectos las entregas anteriores a este PR que aún no estén guardadas. */
export async function importPastDeliveries(
  db: ProjectDb & Pick<PrismaClient, "vegaAction">,
  userId: string,
  limit = 40,
) {
  const saved = await db.projectVersion.findMany({
    where: { project: { userId }, sourceActionId: { not: null } },
    select: { sourceActionId: true },
  });
  const known = saved.map((row) => row.sourceActionId).filter((id): id is string => Boolean(id));
  const actions = await db.vegaAction.findMany({
    where: { userId, kind: "deliver_project", ...(known.length ? { id: { notIn: known } } : {}) },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, conversationId: true, payload: true },
  });
  let imported = 0;
  for (const action of actions) {
    const result = await saveDeliveredProject(db, {
      userId,
      conversationId: action.conversationId,
      actionId: action.id,
      payload: action.payload,
    }).catch(() => null);
    if (result) imported += 1;
  }
  return imported;
}

/** Fecha en hora del centro de México (los socios están en CDMX/MX). */
export function formatProjectDate(iso: string) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso));
}
