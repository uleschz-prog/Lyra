import { get } from "@vercel/blob";
import { NextResponse } from "next/server";

import { requireMember } from "@/lib/auth/api";
import { isPrivateVideoBlobUrl } from "@/lib/studio/blob-url";
import { getPrisma } from "@/lib/prisma";

const imageContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const pieceId = new URL(request.url).searchParams.get("pieceId");
  if (!pieceId) return NextResponse.json({ error: "No se encontró la imagen." }, { status: 400 });

  const piece = await getPrisma().mediaPiece.findFirst({
    where: { id: pieceId, userId: guard.user.id, kind: "image" },
    select: { media: true },
  });
  if (!piece || !isPrivateVideoBlobUrl(piece.media)) {
    return NextResponse.json({ error: "No se encontró la imagen." }, { status: 404 });
  }

  try {
    const image = await get(piece.media, { access: "private" });
    if (!image || image.statusCode !== 200 || !image.stream) {
      return NextResponse.json({ error: "No se pudo leer la imagen." }, { status: 502 });
    }
    const contentType = image.blob.contentType || "application/octet-stream";
    if (!imageContentTypes.has(contentType)) {
      return NextResponse.json({ error: "El archivo guardado no es una imagen compatible." }, { status: 415 });
    }
    return new Response(image.stream, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "No se pudo leer la imagen." }, { status: 502 });
  }
}
