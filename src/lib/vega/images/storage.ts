// Imágenes de Vega en Vercel Blob privado (BLOB_READ_WRITE_TOKEN). Se sirven por /api/vega/images/[id]/file
// solo a su dueño; la URL del Blob nunca llega al navegador.

export type ImageStore = {
  put: (pathname: string, data: Uint8Array, contentType: string) => Promise<string>;
  get: (url: string) => Promise<{ data: Uint8Array; contentType: string } | null>;
};

export const blobImageStore: ImageStore = {
  async put(pathname, data, contentType) {
    const { put } = await import("@vercel/blob");
    const blob = await put(pathname, Buffer.from(data), { access: "private", contentType, addRandomSuffix: true });
    return blob.url;
  },
  async get(url) {
    const { get } = await import("@vercel/blob");
    const result = await get(url, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const buffer = new Uint8Array(await new Response(result.stream).arrayBuffer());
    return { data: buffer, contentType: result.blob?.contentType ?? "image/png" };
  },
};

/** Solo URLs de nuestro Blob bajo vega-imagenes/ (nunca se sigue una URL arbitraria). */
export function isImageBlobUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".blob.vercel-storage.com") && parsed.pathname.includes("/vega-imagenes/");
  } catch {
    return false;
  }
}

export function extensionFor(mediaType: string) {
  if (mediaType === "image/jpeg") return "jpg";
  if (mediaType === "image/webp") return "webp";
  return "png";
}
