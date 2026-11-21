// Respuestas de la Data API de apps publicadas. Las apps corren en /s/[slug] con origen opaco
// (Origin: null): se permite cualquier origen pero sin cookies; la sesión va en Authorization.
import { liveAppLimits } from "@/lib/liveapps/config";

export const liveCors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export function liveJson(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...liveCors },
  });
}

export function bearer(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+([A-Za-z0-9_-]{20,128})$/);
  return match ? match[1] : null;
}

/** Cuerpo JSON con tope de tamaño (el texto llega como text/plain o application/json). */
export async function readJsonBody(request: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > liveAppLimits.maxBodyBytes) return { ok: false, status: 413, error: "La petición es demasiado grande." };
  const text = await request.text();
  if (text.length > liveAppLimits.maxBodyBytes) return { ok: false, status: 413, error: "La petición es demasiado grande." };
  try {
    const body = JSON.parse(text) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("no es objeto");
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return { ok: false, status: 400, error: "JSON inválido." };
  }
}

/** Ruta de la Data API de una app (para el CSP de /s/[slug] y para la app). */
export function liveApiPath(slug: string) {
  return `/api/apps/${slug}/`;
}
