import { clientIp } from "@/lib/auth/rate-limit";
import { submitLead, type LeadDb } from "@/lib/leads/core";
import { getPrisma } from "@/lib/prisma";

// Los sitios publicados tienen origen opaco (Origin: null): se acepta cualquier origen pero sin
// credenciales; no se lee ni se fija ninguna cookie aquí.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function reply(status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...cors, ...extra },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

/** Contacto enviado desde el formulario de un sitio publicado en /s/[slug]. */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > 10_000) return reply(413, { ok: false, error: "El mensaje es demasiado largo." });
  const text = (await request.text().catch(() => "")).slice(0, 12_000);
  try {
    const result = await submitLead(getPrisma() as unknown as LeadDb, { slug: slug.toLowerCase(), ip: clientIp(request), text });
    return reply(result.status, result.body, result.status === 429 ? { "Retry-After": "600" } : {});
  } catch (error) {
    // Sin datos del contacto en el log.
    console.error("[Contactos] no se pudo guardar", { errorType: error instanceof Error ? error.name : typeof error });
    return reply(500, { ok: false, error: "No se pudo enviar. Intenta de nuevo." });
  }
}
