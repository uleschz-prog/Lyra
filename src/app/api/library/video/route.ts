import { get } from "@vercel/blob";
import { NextResponse } from "next/server";

import { requireMember } from "@/lib/auth/api";
import { isPrivateVideoBlobUrl } from "@/lib/studio/blob-url";
import { getPrisma } from "@/lib/prisma";
import { saveVegaVideoBytesToLibrary } from "@/lib/vega/library-media";

const maxUploadBytes = 4 * 1024 * 1024;

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

export async function POST(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxUploadBytes + 256 * 1024) {
    return NextResponse.json({ error: "El video debe pesar menos de 4 MB." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el archivo de video." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > maxUploadBytes) {
    return NextResponse.json({ error: "El video debe pesar menos de 4 MB." }, { status: 413 });
  }
  const contentType = file.type.split(";")[0]?.trim().toLowerCase() ?? "";
  if (contentType !== "video/mp4" && contentType !== "video/webm") {
    return NextResponse.json({ error: "El archivo debe ser un video MP4 o WebM." }, { status: 415 });
  }

  const titleValue = form.get("title");
  const scriptValue = form.get("script");
  const pieceIdValue = form.get("pieceId");
  const title = typeof titleValue === "string" ? titleValue.trim().slice(0, 120) : "";
  const script = typeof scriptValue === "string" ? scriptValue.trim().slice(0, 20_000) : "";
  const pieceId = typeof pieceIdValue === "string" && pieceIdValue.length > 0 ? pieceIdValue : undefined;
  if (!title || !script) {
    return NextResponse.json({ error: "El video necesita un título y un guion." }, { status: 400 });
  }

  try {
    const saved = await saveVegaVideoBytesToLibrary(
      guard.user.id,
      title,
      script,
      new Uint8Array(await file.arrayBuffer()),
      contentType,
      pieceId,
    );
    return NextResponse.json({
      pieceId: saved.id,
      videoUrl: `/api/library/video?pieceId=${encodeURIComponent(saved.id)}`,
    });
  } catch {
    return NextResponse.json({ error: "No se pudo guardar el video en Biblioteca." }, { status: 502 });
  }
}
