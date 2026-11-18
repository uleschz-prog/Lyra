// Entrega 4: herramientas de Vega para abrir y editar proyectos que el socio ya tiene
// (los que hizo con Vega y los que tomó del marketplace).
import type { PrismaClient } from "@/generated/prisma/client";
import { editableFiles, isEditableProject } from "@/lib/builder/edit";
import type { ProjectFile } from "@/lib/vega/build-project";

export type ProjectToolDb = Pick<PrismaClient, "project" | "projectPublish">;
export type LoadFiles = (userId: string, projectId: string, number?: number) => Promise<{ number: number; generator: string; files: ProjectFile[] } | null>;

const idPattern = /^[a-z0-9]{10,40}$/i;
const dateFormat = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Mexico_City" });

type ProjectRow = { id: string; kind: string; title: string; summary: string; versionCount: number; updatedAt: Date; groupKey: string };
const projectSelect = { id: true, kind: true, title: true, summary: true, versionCount: true, updatedAt: true, groupKey: true } as const;

function brief(row: ProjectRow) {
  return {
    proyecto_id: row.id,
    titulo: row.title,
    tipo: row.kind,
    versiones: row.versionCount,
    origen: row.groupKey.startsWith("marketplace:") ? "marketplace" : "vega",
    actualizado: dateFormat.format(row.updatedAt),
  };
}

/** Páginas y secciones de un proyecto v2 (para que Vega sepa qué hay sin leer el código). */
export function describeFiles(files: ProjectFile[]) {
  const map = Object.fromEntries(files.map((file) => [file.path, file.content]));
  const editable = isEditableProject(map);
  const routes = [...(map["src/App.tsx"] ?? "").matchAll(/"(\/[^"]*)":\s*([A-Za-z]+)/g)].map((match) => `${match[1]} (${match[2].replace(/Page$/, "")})`);
  const sections = editable ? editableFiles(map).filter((path) => path.startsWith("src/sections/")).map((path) => path.slice("src/sections/".length, -4)) : [];
  return { editable, paginas: routes, secciones: sections };
}

/** abrir_proyecto: sin texto lista los recientes; con id o nombre devuelve el detalle. */
export async function openProjectTool(db: ProjectToolDb, load: LoadFiles, userId: string, query: string, appUrl: string) {
  const text = query.trim().slice(0, 120);
  let rows: ProjectRow[] = [];
  if (text && idPattern.test(text)) {
    const row = await db.project.findFirst({ where: { id: text, userId, deletedAt: null }, select: projectSelect });
    if (row) rows = [row];
  }
  if (!rows.length && text) {
    rows = await db.project.findMany({ where: { userId, deletedAt: null, title: { contains: text, mode: "insensitive" } }, orderBy: { updatedAt: "desc" }, take: 6, select: projectSelect });
  }
  if (rows.length !== 1) {
    const recent = rows.length
      ? rows
      : await db.project.findMany({ where: { userId, deletedAt: null, kind: { in: ["sitio", "app"] } }, orderBy: { updatedAt: "desc" }, take: 8, select: projectSelect });
    return {
      status: recent.length ? `Encontré ${recent.length} proyecto${recent.length === 1 ? "" : "s"}` : "Sin proyectos",
      response: {
        encontrados: recent.map(brief),
        nota: recent.length
          ? text
            ? "Hay varios o ninguno exacto: pregúntale al socio cuál quiere (por nombre) antes de editar."
            : "Proyectos recientes del socio. Pregúntale cuál quiere abrir si no lo dijo."
          : "El socio no tiene sitios ni apps en Proyectos.",
      },
    };
  }
  const row = rows[0];
  const files = row.kind === "sitio" || row.kind === "app" ? await load(userId, row.id).catch(() => null) : null;
  const described = files ? describeFiles(files.files) : { editable: false, paginas: [], secciones: [] };
  const publish = await db.projectPublish.findUnique({ where: { projectId: row.id }, select: { slug: true, status: true } }).catch(() => null);
  return {
    status: `Abrí «${row.title}»`,
    response: {
      ...brief(row),
      resumen: row.summary,
      version_actual: files?.number ?? row.versionCount,
      se_puede_editar: described.editable,
      motivo: described.editable
        ? undefined
        : row.kind === "sitio" || row.kind === "app"
          ? "Se hizo con la versión básica; para cambiarlo hay que hacer uno nuevo con entregar_proyecto."
          : "Solo se editan sitios y apps.",
      paginas: described.paginas,
      secciones: described.secciones,
      publicado: publish?.status === "published" ? `${appUrl.replace(/\/$/, "")}/s/${publish.slug}` : null,
      nota: described.editable
        ? "Para cambiarlo usa editar_proyecto con este proyecto_id y el cambio exacto. Se guarda como versión nueva; si está publicado, el socio elige cuándo publicar la nueva versión."
        : undefined,
    },
  };
}
