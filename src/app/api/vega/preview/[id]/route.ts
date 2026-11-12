import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";
import { projectHtml, type ProjectDraft } from "@/lib/vega/build-project";
import { sandboxedHtmlResponse } from "@/lib/vega/sandboxed-html";

function notFound() {
  return new Response("No encontramos esta vista previa.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

function htmlOf(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const files = (payload as { files?: unknown }).files;
  if (!Array.isArray(files)) return "";
  return projectHtml(payload as ProjectDraft);
}

/** Vista previa de un proyecto entregado por Vega, en pestaña propia y aislada (origen opaco). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return notFound();
  const { id } = await context.params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return notFound();
  const action = await getPrisma().vegaAction.findFirst({
    where: { id, userId: user.id, kind: "deliver_project" },
    select: { payload: true },
  });
  const html = action ? htmlOf(action.payload) : "";
  if (!html) return notFound();
  return sandboxedHtmlResponse(html);
}
