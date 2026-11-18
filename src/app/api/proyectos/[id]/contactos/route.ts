import { getCurrentUser } from "@/lib/auth/profile";
import { leadsCsv } from "@/lib/leads/core";
import { leadsForCsv } from "@/lib/leads/queries";
import { getPrisma } from "@/lib/prisma";
import { zipFileName } from "@/lib/projects/store";

/** Exporta los contactos del proyecto a CSV (solo el dueño). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Inicia sesión para continuar.", { status: 401 });
  const { id } = await context.params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return new Response("No encontrado.", { status: 404 });
  const project = await getPrisma().project.findFirst({ where: { id, userId: user.id }, select: { title: true } });
  if (!project) return new Response("No encontrado.", { status: 404 });
  const rows = await leadsForCsv(user.id, id);
  const name = zipFileName(project.title, 1).replace(/-v1\.zip$/, "-contactos.csv");
  return new Response(leadsCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
