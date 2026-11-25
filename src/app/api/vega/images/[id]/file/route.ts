import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/profile";
import { readImageFile } from "@/lib/vega/images/runner";
import { extensionFor } from "@/lib/vega/images/storage";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** La imagen (Blob privado) solo para su dueño. ?descargar=1 la baja como archivo. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });
  const { id } = await context.params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  const file = await readImageFile(getPrisma(), user.id, id);
  if (!file) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  const download = new URL(request.url).searchParams.get("descargar") === "1";
  return new Response(Buffer.from(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      ...(download ? { "Content-Disposition": `attachment; filename="imagen-vega-${id}.${extensionFor(file.contentType)}"` } : {}),
    },
  });
}
