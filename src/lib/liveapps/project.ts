import { MANIFEST_PATH } from "@/lib/liveapps/manifest";

/** JSON del manifiesto de datos en vivo dentro de los archivos de una versión (o null). */
export function manifestFromFiles(files: { path: string; content: string }[] | null | undefined): unknown {
  const file = files?.find((entry) => entry.path === MANIFEST_PATH);
  if (!file) return null;
  try {
    return JSON.parse(file.content) as unknown;
  } catch {
    return null;
  }
}
