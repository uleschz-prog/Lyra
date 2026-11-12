import { getPrisma } from "@/lib/prisma";
import { findSecret, secretError } from "@/lib/vega/secret-filter";

/**
 * Espacio de archivos de Vega, guardado en la base de datos (Postgres).
 * Antes vivía en el disco del servidor, que en Vercel es de solo lectura y se
 * borra en cada despliegue. Cada consulta filtra por userId: un socio nunca ve
 * los archivos de otro.
 */

export const MAX_FILE_BYTES = 200_000;
export const MAX_USER_BYTES = 2_000_000;
export const MAX_FILES = 300;
const MAX_PATH = 200;
const MAX_DEPTH = 6;

export type WorkspaceEntry = { nombre: string; ruta: string; tipo: "carpeta" | "archivo"; bytes: number | null };
export type VegaFileView = { path: string; bytes: number; updatedAt: string };

type Fail = { ok: false; error: string };

/** Normaliza una ruta relativa ("notas/ideas.md") y rechaza todo lo que salga del espacio. */
export function normalizePath(raw: string, allowRoot = false): { ok: true; path: string } | Fail {
  const clean = raw
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^(\.\/)+/, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  if (!clean || clean === ".") return allowRoot ? { ok: true, path: "" } : { ok: false, error: "Falta la ruta del archivo." };
  if (/[\u0000-\u001f\u007f]/.test(clean)) return { ok: false, error: "La ruta tiene caracteres no válidos." };
  const segments = clean.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return { ok: false, error: "La ruta no puede salir de tu espacio de trabajo." };
  }
  if (clean.length > MAX_PATH || segments.length > MAX_DEPTH || segments.some((segment) => segment.length > 80)) {
    return { ok: false, error: "La ruta es demasiado larga." };
  }
  return { ok: true, path: clean };
}

function bytesOf(text: string) {
  return Buffer.byteLength(text, "utf8");
}

export async function listFiles(userId: string): Promise<VegaFileView[]> {
  const rows = await getPrisma().vegaFile.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: MAX_FILES,
    select: { path: true, bytes: true, updatedAt: true },
  });
  return rows.map((row) => ({ path: row.path, bytes: row.bytes, updatedAt: row.updatedAt.toISOString() }));
}

/** Lista una carpeta (por omisión la raíz): archivos directos y subcarpetas. */
export async function listWorkspace(userId: string, folder = "."): Promise<{ ok: true; entries: WorkspaceEntry[] } | Fail> {
  const target = normalizePath(folder, true);
  if (!target.ok) return target;
  const prefix = target.path ? `${target.path}/` : "";
  const files = await listFiles(userId);
  const folders = new Map<string, WorkspaceEntry>();
  const entries: WorkspaceEntry[] = [];
  for (const file of files) {
    if (!file.path.startsWith(prefix)) continue;
    const rest = file.path.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash === -1) entries.push({ nombre: rest, ruta: file.path, tipo: "archivo", bytes: file.bytes });
    else {
      const name = rest.slice(0, slash);
      if (!folders.has(name)) folders.set(name, { nombre: name, ruta: `${prefix}${name}`, tipo: "carpeta", bytes: null });
    }
  }
  if (target.path && entries.length === 0 && folders.size === 0) {
    return { ok: false, error: "Esa carpeta no existe en tu espacio de trabajo." };
  }
  const sorted = [...folders.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  return { ok: true, entries: [...sorted, ...entries.sort((a, b) => a.nombre.localeCompare(b.nombre))] };
}

export async function readWorkspaceFile(
  userId: string,
  raw: string,
): Promise<{ ok: true; path: string; contenido: string; truncado: boolean; bytes: number } | Fail> {
  const target = normalizePath(raw);
  if (!target.ok) return target;
  const row = await getPrisma().vegaFile.findFirst({ where: { userId, path: target.path }, select: { path: true, content: true, bytes: true } });
  if (!row) return { ok: false, error: "Ese archivo no existe en tu espacio de trabajo." };
  return { ok: true, path: row.path, contenido: row.content, truncado: false, bytes: row.bytes };
}

/** Crea, reemplaza o agrega al final de un archivo de texto. */
export async function writeWorkspaceFile(
  userId: string,
  raw: string,
  content: string,
  append = false,
): Promise<{ ok: true; path: string; bytes: number; created: boolean } | Fail> {
  const target = normalizePath(raw);
  if (!target.ok) return target;
  const secret = findSecret(content);
  if (secret) return { ok: false, error: secretError(secret) };

  const prisma = getPrisma();
  const all = await prisma.vegaFile.findMany({ where: { userId }, select: { id: true, path: true, bytes: true } });
  const current = all.find((file) => file.path === target.path) ?? null;
  if (!current && all.some((file) => file.path.startsWith(`${target.path}/`))) {
    return { ok: false, error: "Ya existe una carpeta con ese nombre." };
  }

  let next = content;
  if (append && current) {
    const row = await prisma.vegaFile.findFirst({ where: { id: current.id, userId }, select: { content: true } });
    const previous = row?.content ?? "";
    next = previous && !previous.endsWith("\n") ? `${previous}\n${content}` : `${previous}${content}`;
  }
  const bytes = bytesOf(next);
  if (bytes > MAX_FILE_BYTES) return { ok: false, error: `El archivo superaría el límite de ${MAX_FILE_BYTES / 1000} KB.` };
  const used = all.reduce((sum, file) => sum + (file.id === current?.id ? 0 : file.bytes), 0);
  if (used + bytes > MAX_USER_BYTES) {
    return { ok: false, error: `Tu espacio superaría ${MAX_USER_BYTES / 1_000_000} MB. Borra archivos desde el panel Archivos.` };
  }

  if (current) {
    await prisma.vegaFile.updateMany({ where: { id: current.id, userId }, data: { content: next, bytes, updatedAt: new Date() } });
    return { ok: true, path: target.path, bytes, created: false };
  }
  if (all.length >= MAX_FILES) return { ok: false, error: `Llegaste al máximo de ${MAX_FILES} archivos. Borra algunos desde el panel Archivos.` };
  await prisma.vegaFile.create({ data: { userId, path: target.path, content: next, bytes }, select: { id: true } });
  return { ok: true, path: target.path, bytes, created: true };
}

/** Busca por nombre o contenido. */
export async function searchWorkspace(userId: string, query: string): Promise<{ ok: true; coincidencias: WorkspaceEntry[] } | Fail> {
  const needle = query.trim().slice(0, 120);
  if (!needle) return { ok: false, error: "Falta qué buscar." };
  const rows = await getPrisma().vegaFile.findMany({
    where: {
      userId,
      OR: [{ path: { contains: needle, mode: "insensitive" } }, { content: { contains: needle, mode: "insensitive" } }],
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { path: true, bytes: true },
  });
  return {
    ok: true,
    coincidencias: rows.map((row) => ({ nombre: row.path.split("/").pop() ?? row.path, ruta: row.path, tipo: "archivo" as const, bytes: row.bytes })),
  };
}

export async function deleteWorkspaceFile(userId: string, raw: string) {
  const target = normalizePath(raw);
  if (!target.ok) return false;
  const deleted = await getPrisma().vegaFile.deleteMany({ where: { userId, path: target.path } });
  return deleted.count > 0;
}
