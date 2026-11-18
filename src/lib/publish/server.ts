import { readStoredFiles, readStoredPreview } from "@/lib/builder/storage";
import { cleanProjectFiles } from "@/lib/projects/store";
import type { PublishedTarget } from "@/lib/publish/core";

/** HTML compilado de la versión publicada (Blob privado o base; v1 es su index.html). */
export async function publishedSourceHtml(target: PublishedTarget): Promise<string | null> {
  const version = target.version;
  if (version.previewUrl) return readStoredPreview(version.previewUrl);
  if (version.previewHtml) return version.previewHtml;
  const raw = version.filesUrl ? await readStoredFiles(version.filesUrl) : version.files;
  const cleaned = cleanProjectFiles(raw);
  return cleaned?.files.find((file) => file.path === "index.html")?.content ?? null;
}

/** Origen público de LYRA (variable de entorno o el host de la petición). */
export function appOrigin(request: Request) {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return new URL(request.url).origin;
}
