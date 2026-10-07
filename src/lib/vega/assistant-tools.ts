import { promises as fs } from "node:fs";
import path from "node:path";

import { generateStill } from "@/lib/ai/media";

/**
 * Herramientas de asistente de Vega sobre un espacio de trabajo privado por socio.
 * Todo vive bajo `.vega-workspace/<userId>/` y ninguna ruta puede salir de ahí.
 */

const WORKSPACE_ROOT = path.join(process.cwd(), ".vega-workspace");

/** Palabras y separadores que nunca se permiten en una ruta relativa. */
const dangerousPath = /(^|[\\/])\.\.([\\/]|$)|[\0]/;

export function workspaceDir(userId: string) {
  return path.join(WORKSPACE_ROOT, userId);
}

/** Resuelve una ruta relativa dentro del espacio del socio y evita salir de él. */
export function resolveWorkspacePath(userId: string, relative: string): { ok: true; absolute: string; relative: string } | { ok: false; error: string } {
  const clean = relative.trim().replace(/^\/+/, "");
  if (!clean) return { ok: false, error: "Falta la ruta del archivo." };
  if (dangerousPath.test(clean)) return { ok: false, error: "La ruta no puede salir de tu espacio de trabajo." };
  const base = workspaceDir(userId);
  const absolute = path.resolve(base, clean);
  if (absolute !== base && !absolute.startsWith(`${base}${path.sep}`)) {
    return { ok: false, error: "La ruta no puede salir de tu espacio de trabajo." };
  }
  return { ok: true, absolute, relative: path.relative(base, absolute) || ".".replace(/\\/g, "/") };
}

export async function ensureWorkspace(userId: string) {
  await fs.mkdir(workspaceDir(userId), { recursive: true });
}

export type WorkspaceEntry = { nombre: string; ruta: string; tipo: "carpeta" | "archivo"; bytes: number | null };

/** Lista una carpeta del espacio (por omisión la raíz), con un nivel de profundidad. */
export async function listWorkspace(userId: string, relative = "."): Promise<{ ok: true; entries: WorkspaceEntry[] } | { ok: false; error: string }> {
  const target = resolveWorkspacePath(userId, relative || ".");
  if (!target.ok) return target;
  await ensureWorkspace(userId);
  let dirents;
  try {
    dirents = await fs.readdir(target.absolute, { withFileTypes: true });
  } catch {
    return { ok: false, error: "Esa carpeta no existe en tu espacio de trabajo." };
  }
  const entries: WorkspaceEntry[] = [];
  for (const dirent of dirents) {
    const child = path.join(target.absolute, dirent.name);
    const childRelative = path.relative(workspaceDir(userId), child).split(path.sep).join("/");
    if (dirent.isDirectory()) {
      entries.push({ nombre: dirent.name, ruta: childRelative, tipo: "carpeta", bytes: null });
    } else if (dirent.isFile()) {
      const stat = await fs.stat(child).catch(() => null);
      entries.push({ nombre: dirent.name, ruta: childRelative, tipo: "archivo", bytes: stat?.size ?? null });
    }
  }
  entries.sort((left, right) => (left.tipo === right.tipo ? left.nombre.localeCompare(right.nombre) : left.tipo === "carpeta" ? -1 : 1));
  return { ok: true, entries };
}

const MAX_READ_BYTES = 200_000;
const MAX_WRITE_BYTES = 500_000;

export async function readWorkspaceFile(userId: string, relative: string): Promise<{ ok: true; path: string; contenido: string; truncado: boolean; bytes: number } | { ok: false; error: string }> {
  const target = resolveWorkspacePath(userId, relative);
  if (!target.ok) return target;
  const stat = await fs.stat(target.absolute).catch(() => null);
  if (!stat || !stat.isFile()) return { ok: false, error: "Ese archivo no existe en tu espacio de trabajo." };
  const handle = await fs.open(target.absolute, "r");
  try {
    const length = Math.min(stat.size, MAX_READ_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, 0);
    return {
      ok: true,
      path: target.relative,
      contenido: buffer.toString("utf8"),
      truncado: stat.size > MAX_READ_BYTES,
      bytes: stat.size,
    };
  } finally {
    await handle.close();
  }
}

export async function writeWorkspaceFile(
  userId: string,
  relative: string,
  content: string,
  append = false,
): Promise<{ ok: true; path: string; bytes: number } | { ok: false; error: string }> {
  const target = resolveWorkspacePath(userId, relative);
  if (!target.ok) return target;
  if (Buffer.byteLength(content, "utf8") > MAX_WRITE_BYTES) {
    return { ok: false, error: "El contenido supera el límite de 500 KB por archivo." };
  }
  await ensureWorkspace(userId);
  await fs.mkdir(path.dirname(target.absolute), { recursive: true });
  if (append) await fs.appendFile(target.absolute, content, "utf8");
  else await fs.writeFile(target.absolute, content, "utf8");
  const stat = await fs.stat(target.absolute).catch(() => null);
  return { ok: true, path: target.relative, bytes: stat?.size ?? 0 };
}

/** Busca archivos por nombre dentro del espacio del socio (hasta 3 niveles). */
export async function searchWorkspace(userId: string, query: string): Promise<{ ok: true; coincidencias: WorkspaceEntry[] } | { ok: false; error: string }> {
  await ensureWorkspace(userId);
  const base = workspaceDir(userId);
  const needle = query.trim().toLowerCase();
  if (!needle) return { ok: false, error: "Falta qué buscar." };
  const found: WorkspaceEntry[] = [];
  const walk = async (dir: string, depth: number) => {
    if (depth > 3 || found.length >= 50) return;
    const dirents = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const dirent of dirents) {
      if (found.length >= 50) return;
      const child = path.join(dir, dirent.name);
      const childRelative = path.relative(base, child).split(path.sep).join("/");
      if (dirent.name.toLowerCase().includes(needle)) {
        found.push({
          nombre: dirent.name,
          ruta: childRelative,
          tipo: dirent.isDirectory() ? "carpeta" : "archivo",
          bytes: dirent.isFile() ? (await fs.stat(child).catch(() => null))?.size ?? null : null,
        });
      }
      if (dirent.isDirectory()) await walk(child, depth + 1);
    }
  };
  await walk(base, 1);
  return { ok: true, coincidencias: found };
}

export type CommandSpec = {
  id: string;
  label: string;
  description: string;
  /** Construye los argumentos a partir de los campos que manda Vega. */
  build: (args: Record<string, unknown>) => { ok: true; cmd: string; args: string[] } | { ok: false; error: string };
};

/**
 * Comandos permitidos. NO se ejecuta shell libre: cada entrada fija el binario y
 * sólo acepta argumentos simples (sin metacaracteres). Cualquier acción sobre el
 * espacio de trabajo la ejecuta Node directamente, no el shell.
 */
export const commandAllowlist: CommandSpec[] = [
  {
    id: "date",
    label: "Fecha y hora",
    description: "Muestra la fecha y hora actual del servidor.",
    build: () => ({ ok: true, cmd: "date", args: [] }),
  },
  {
    id: "df",
    label: "Espacio en disco",
    description: "Muestra el espacio libre y usado del disco.",
    build: () => ({ ok: true, cmd: "df", args: ["-h"] }),
  },
  {
    id: "uptime",
    label: "Tiempo encendido",
    description: "Muestra cuánto lleva encendido el servidor y su carga.",
    build: () => ({ ok: true, cmd: "uptime", args: [] }),
  },
  {
    id: "node_version",
    label: "Versión de Node",
    description: "Muestra la versión de Node del servidor.",
    build: () => ({ ok: true, cmd: "node", args: ["--version"] }),
  },
];

export function findCommand(id: string) {
  return commandAllowlist.find((command) => command.id === id) ?? null;
}

/** Verifica que un argumento no contenga metacaracteres de shell ni rutas absolutas. */
export function isSafeArgument(value: string) {
  return !/[;&|`$<>(){}\[\]!*?~\\\n\r]/.test(value) && !value.startsWith("/") && !value.startsWith("-");
}

export type ImageResult =
  | { ok: true; dataUrl: string; note: string }
  | { ok: false; error: string };

/**
 * Genera una imagen con un modelo de imagen. El modelo de chat no devuelve pixeles.
 */
export async function generateImage(prompt: string, size?: string): Promise<ImageResult> {
  return generateStill(prompt, size);
}
