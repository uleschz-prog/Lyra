import { getCurrentUser } from "@/lib/auth/profile";
import { hasReadySite, readySiteFileName } from "@/lib/projects/handoff";
import { getProjectVersionPreview, parseVersionParam } from "@/lib/projects/queries";
import { sandboxedHtmlCsp } from "@/lib/vega/sandboxed-html";

function notFound() {
  return new Response("No encontrado.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
}

/** Descarga el «sitio listo»: el HTML único ya compilado de una versión. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Inicia sesión para continuar.", { status: 401 });
  const { id } = await context.params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return notFound();
  const preview = await getProjectVersionPreview(user.id, id, parseVersionParam(new URL(request.url).searchParams.get("v")));
  if (!preview || !preview.kind || !hasReadySite(preview.kind)) return notFound();
  return new Response(preview.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${readySiteFileName(preview.title, preview.number)}"`,
      // Si alguien lo abre en vez de descargarlo, se queda aislado (origen opaco).
      "Content-Security-Policy": sandboxedHtmlCsp,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
