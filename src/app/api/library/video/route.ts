import { get } from "@vercel/blob";
import { NextResponse } from "next/server";

import { requireMember } from "@/lib/auth/api";
import { isPrivateVideoBlobUrl } from "@/lib/studio/blob-url";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const pieceId = new URL(request.url).searchParams.get("pieceId");
  if (!pieceId) return NextResponse.json({ error: "No se encontró el video." }, { status: 400 });

  const piece = await getPrisma().mediaPiece.findFirst({
    where: { id: pieceId, userId: guard.user.id, kind: "video" },
    select: { media: true },
  });
  if (!piece || !isPrivateVideoBlobUrl(piece.media)) {
    return NextResponse.json({ error: "No se encontró el video." }, { status: 404 });
  }

  try {
    const video = await get(piece.media, { access: "private" });
    if (!video || video.statusCode !== 200 || !video.stream) {
      return NextResponse.json({ error: "No se pudo leer el video." }, { status: 502 });
    }
    const headers = new Headers({
      "Content-Type": video.blob.contentType || "video/mp4",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (video.blob.size > 0) headers.set("Content-Length", String(video.blob.size));
    return new Response(video.stream, { headers });
  } catch {
    return NextResponse.json({ error: "No se pudo leer el video." }, { status: 502 });
  }
}
