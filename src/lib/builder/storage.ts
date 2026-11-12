// Archivos y vista previa del generador v2: Vercel Blob privado cuando hay BLOB_READ_WRITE_TOKEN;
// si no, todo queda en la base (ProjectVersion.files y previewHtml).
import type { ProjectFile } from "@/lib/vega/build-project";

type Env = Record<string, string | undefined>;

export function blobEnabled(env: Env = process.env) {
  return Boolean(env.BLOB_READ_WRITE_TOKEN?.trim());
}

export type StoredArtifacts = { filesUrl: string | null; previewUrl: string | null };

export type ArtifactStore = {
  put: (pathname: string, body: string, contentType: string) => Promise<string>;
  get: (url: string) => Promise<string | null>;
};

/** Blob privado (mismo patrón que la Biblioteca). */
export const blobStore: ArtifactStore = {
  async put(pathname, body, contentType) {
    const { put } = await import("@vercel/blob");
    const blob = await put(pathname, body, { access: "private", contentType, allowOverwrite: true });
    return blob.url;
  },
  async get(url) {
    const { get } = await import("@vercel/blob");
    const result = await get(url, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return new Response(result.stream).text();
  },
};

/** Solo URLs de nuestro Blob privado (no se sigue cualquier URL guardada). */
export function isBuilderBlobUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".blob.vercel-storage.com") && parsed.pathname.includes("/proyectos/");
  } catch {
    return false;
  }
}

export async function storeArtifacts(
  input: { userId: string; buildId: string; files: ProjectFile[]; html: string },
  options: { store?: ArtifactStore; env?: Env } = {},
): Promise<StoredArtifacts> {
  if (!blobEnabled(options.env)) return { filesUrl: null, previewUrl: null };
  const store = options.store ?? blobStore;
  const base = `proyectos/${input.userId}/${input.buildId}`;
  try {
    const [filesUrl, previewUrl] = await Promise.all([
      store.put(`${base}/files.json`, JSON.stringify(input.files), "application/json"),
      store.put(`${base}/preview.html`, input.html, "text/html"),
    ]);
    return { filesUrl, previewUrl };
  } catch (error) {
    // Si Blob falla, la versión se guarda completa en la base: nunca se pierde el trabajo.
    console.error("[Generador] Blob no disponible, se guarda en la base", { errorType: error instanceof Error ? error.name : typeof error });
    return { filesUrl: null, previewUrl: null };
  }
}

export async function readStoredFiles(url: string, store: ArtifactStore = blobStore): Promise<unknown> {
  if (!isBuilderBlobUrl(url)) return null;
  const text = await store.get(url).catch(() => null);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function readStoredPreview(url: string, store: ArtifactStore = blobStore): Promise<string | null> {
  if (!isBuilderBlobUrl(url)) return null;
  return store.get(url).catch(() => null);
}
