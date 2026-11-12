import { getCurrentUser } from "@/lib/auth/profile";
import { canView } from "@/lib/marketplace/core";
import { marketDb } from "@/lib/marketplace/server";
import { cleanProjectFiles } from "@/lib/projects/store";
import { sandboxedHtmlResponse } from "@/lib/vega/sandboxed-html";

function notFound() {
  return new Response("No encontramos esta vista previa.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

/** Vista previa aislada (CSP sandbox, origen opaco) de una plantilla del Marketplace. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return notFound();
  const { id } = await context.params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return notFound();
  const template = await marketDb().marketplaceTemplate.findUnique({
    where: { id },
    select: { status: true, authorId: true, generator: true, previewHtml: true, files: true },
  });
  if (!template || !canView(template, { id: user.id, role: user.role })) return notFound();
  const html = template.previewHtml ?? cleanProjectFiles(template.files)?.files.find((file) => file.path === "index.html")?.content;
  if (!html) return notFound();
  return sandboxedHtmlResponse(html, 200, { fonts: template.generator === "vega-v2" });
}
