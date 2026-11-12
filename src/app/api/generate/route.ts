import { NextResponse } from "next/server";

import { parseSoul2ImageOptions, parseWanVideoOptions } from "@/lib/ai/higgsfield-api";
import { beginHiggsfieldGeneration, getActiveHiggsfieldGeneration } from "@/lib/ai/higgsfield-generation";
import { requireAdmin } from "@/lib/auth/api";

export const maxDuration = 30;

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const generation = await getActiveHiggsfieldGeneration(guard.user.id);
  return NextResponse.json(generation ? { generation } : { generation: null }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as
    | { prompt?: unknown; kind?: unknown; requestKey?: unknown; imageOptions?: unknown; videoOptions?: unknown }
    | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const kind = body?.kind;
  const requestKey = typeof body?.requestKey === "string" ? body.requestKey : "";
  if (prompt.length < 4 || prompt.length > 5000) {
    return NextResponse.json({ error: "El prompt debe tener entre 4 y 5000 caracteres." }, { status: 400 });
  }
  if (kind !== "image" && kind !== "video") {
    return NextResponse.json({ error: "Selecciona imagen o video." }, { status: 400 });
  }
  const imageOptions = parseSoul2ImageOptions(kind === "image" ? body?.imageOptions : undefined);
  if (!imageOptions) {
    return NextResponse.json({ error: "Los parámetros de imagen no son válidos." }, { status: 400 });
  }
  const videoOptions = parseWanVideoOptions(kind === "video" ? body?.videoOptions : undefined);
  if (!videoOptions) {
    return NextResponse.json({ error: "Los parámetros de video no son válidos." }, { status: 400 });
  }
  if (!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(requestKey)) {
    return NextResponse.json({ error: "No se pudo identificar la solicitud. Intenta de nuevo." }, { status: 400 });
  }

  const result = await beginHiggsfieldGeneration({
    userId: guard.user.id,
    requestKey,
    prompt,
    kind,
    imageOptions,
    videoOptions,
  });
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        ...("generation" in result ? { generation: result.generation } : {}),
        ...("credits" in result && result.credits !== undefined ? { credits: result.credits } : {}),
        ...("retryable" in result && result.retryable ? { retryable: true } : {}),
      },
      { status: result.httpStatus },
    );
  }
  return NextResponse.json({
    id: result.generation.id,
    request_id: result.generation.request_id,
    status: result.generation.status,
    kind: result.generation.kind,
    outputs: result.generation.outputs,
    ...(result.credits === undefined ? {} : { credits: result.credits }),
  });
}
