import { NextResponse } from "next/server";

import { readHiggsfieldOutput } from "@/lib/ai/higgsfield-generation";
import { requireMember } from "@/lib/auth/api";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const index = Number(new URL(request.url).searchParams.get("index") ?? "0");
  if (!Number.isInteger(index) || index < 0 || index > 3) {
    return NextResponse.json({ error: "El archivo solicitado no es válido." }, { status: 400 });
  }
  try {
    const output = await readHiggsfieldOutput(guard.user.id, id, index);
    if (!output || output.statusCode !== 200 || !output.stream) {
      return NextResponse.json({ error: "No encontramos el archivo generado." }, { status: 404 });
    }
    return new Response(output.stream, {
      headers: {
        "Content-Type": output.blob.contentType || "application/octet-stream",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "No se pudo leer el archivo generado." }, { status: 502 });
  }
}
