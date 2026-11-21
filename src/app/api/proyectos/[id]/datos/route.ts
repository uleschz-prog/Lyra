import { getCurrentUser } from "@/lib/auth/profile";
import { exportCollection, toCsv } from "@/lib/liveapps/core";
import { getPrisma } from "@/lib/prisma";

// Exporta a CSV una colección de los datos en vivo de una app (solo el dueño).
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Inicia sesión.", { status: 401 });
  const { id } = await context.params;
  const key = new URL(request.url).searchParams.get("c") ?? "";
  const data = await exportCollection(getPrisma(), user.id, id, key).catch(() => null);
  if (!data) return new Response("No encontramos esos datos.", { status: 404 });
  const name = `${data.collection.key}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(toCsv(data), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
