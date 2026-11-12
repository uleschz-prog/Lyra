import { getCurrentUser } from "@/lib/auth/profile";
import { getProjectVersionFiles, parseVersionParam } from "@/lib/projects/queries";
import { sandboxedHtmlResponse } from "@/lib/vega/sandboxed-html";

function notFound() {
  return new Response("No encontramos esta vista previa.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

/** Vista previa aislada (CSP sandbox, origen opaco) de una versión del proyecto. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return notFound();
  const { id } = await context.params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return notFound();
  const version = await getProjectVersionFiles(user.id, id, parseVersionParam(new URL(request.url).searchParams.get("v")));
  const html = version?.files.find((file) => file.path === "index.html")?.content;
  if (!html) return notFound();
  return sandboxedHtmlResponse(html);
}
