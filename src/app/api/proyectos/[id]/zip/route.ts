import { getCurrentUser } from "@/lib/auth/profile";
import { getProjectVersionFiles, parseVersionParam } from "@/lib/projects/queries";
import { zipFileName } from "@/lib/projects/store";
import { zipStore } from "@/lib/vega/zip-store";

/** Descarga el código de una versión como ZIP. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Inicia sesión para continuar.", { status: 401 });
  const { id } = await context.params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return new Response("No encontrado.", { status: 404 });
  const version = await getProjectVersionFiles(user.id, id, parseVersionParam(new URL(request.url).searchParams.get("v")));
  if (!version) return new Response("No encontrado.", { status: 404 });
  const zip = zipStore(version.files);
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFileName(version.title, version.number)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
