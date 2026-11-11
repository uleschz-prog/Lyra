import { put } from "@vercel/blob";

import { readOpenRouterVideo } from "@/lib/ai/media";
import type { VegaActionView } from "@/lib/vega/events";
import { saveCreationForUser } from "@/lib/media-pieces";
import { getPrisma } from "@/lib/prisma";
import type { ActionKind, ActionPayload, ImageDraft, VideoDraft } from "@/lib/vega/tools";

const maxImageBytes = 2_000_000;
const maxVideoBytes = 100 * 1024 * 1024;
const videoTypes = new Set(["video/mp4", "video/webm"]);

function actionView(action: { id: string; kind: string; payload: unknown; status: string; result: string | null }): VegaActionView {
  return {
    id: action.id,
    kind: action.kind as ActionKind,
    payload: action.payload as ActionPayload,
    status: action.status as VegaActionView["status"],
    result: action.result,
  };
}

function dataUrlImage(value: string) {
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > maxImageBytes) return null;
  const extension = match[1] === "image/jpeg" ? "jpg" : match[1].slice("image/".length);
  return { bytes, contentType: match[1], extension };
}

async function responseBytes(response: Response, maxBytes: number) {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > maxBytes || !response.ok || !response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return total ? Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))) : null;
}

async function videoBytes(url: string) {
  const local = new URL(url, "https://lyra.local");
  if (local.origin === "https://lyra.local" && local.pathname === "/api/ai/video") {
    const jobId = local.searchParams.get("jobId") ?? "";
    const video = await readOpenRouterVideo(jobId, true);
    if (!video.ok || video.status !== "completed" || !("body" in video) || !video.body || !videoTypes.has(video.contentType)) {
      return null;
    }
    const response = new Response(video.body, { headers: { "content-type": video.contentType } });
    const bytes = await responseBytes(response, maxVideoBytes);
    return bytes ? { bytes, contentType: video.contentType } : null;
  }

  if (local.protocol !== "https:" || local.username || local.password) return null;
  const allowedHost = local.hostname.endsWith(".runwayml.com") || local.hostname.endsWith(".cloudfront.net");
  if (!allowedHost) return null;
  const response = await fetch(local, { cache: "no-store", signal: AbortSignal.timeout(45_000) });
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!videoTypes.has(contentType)) return null;
  const bytes = await responseBytes(response, maxVideoBytes);
  return bytes ? { bytes, contentType } : null;
}

async function storeVegaImage(input: {
  userId: string;
  key: string;
  prompt: string;
  dataUrl: string;
}) {
  const image = dataUrlImage(input.dataUrl);
  if (!image) throw new Error("La imagen generada no tiene un formato o tamaño compatible.");

  const blob = await put(
    `lyra-vega/${input.userId}/images/${input.key}.${image.extension}`,
    image.bytes,
    { access: "private", contentType: image.contentType, allowOverwrite: true },
  );
  return blob.url;
}

export async function saveVegaImageActionToLibrary(input: {
  userId: string;
  actionId: string;
  prompt: string;
  dataUrl: string;
  payload: Omit<ImageDraft, "dataUrl" | "imageUrl">;
  result: string;
}) {
  const media = await storeVegaImage({ ...input, key: input.actionId });
  return getPrisma().$transaction(async (tx) => {
    const claimed = await tx.vegaAction.updateMany({
      where: { id: input.actionId, userId: input.userId, kind: "create_image", status: "running" },
      data: { status: "done", result: input.result },
    });
    if (claimed.count === 0) {
      const current = await tx.vegaAction.findFirst({
        where: { id: input.actionId, userId: input.userId, kind: "create_image" },
        select: { id: true, kind: true, payload: true, status: true, result: true },
      });
      const existing = await tx.mediaPiece.findFirst({
        where: { userId: input.userId, area: "studio", kind: "image", media },
        select: { id: true },
      });
      if (!current || !existing) throw new Error("La imagen se completó sin guardarse en Biblioteca.");
      return actionView(current);
    }

    const piece = await tx.mediaPiece.create({
      data: {
        userId: input.userId,
        area: "studio",
        kind: "image",
        title: input.prompt.trim().slice(0, 120) || "Imagen de Vega",
        body: input.prompt.slice(0, 20_000),
        media,
      },
      select: { id: true },
    });
    const payload: ImageDraft = {
      ...input.payload,
      imageUrl: `/api/library/image?pieceId=${encodeURIComponent(piece.id)}`,
    };
    await tx.vegaAction.update({
      where: { id: input.actionId },
      data: { payload: payload as object },
    });
    const current = await tx.vegaAction.findFirstOrThrow({
      where: { id: input.actionId, userId: input.userId },
      select: { id: true, kind: true, payload: true, status: true, result: true },
    });
    return actionView(current);
  });
}

export async function saveVegaVideoToLibrary(userId: string, video: VideoDraft) {
  if (!video.videoUrl) {
    const piece = await saveCreationForUser(userId, {
      area: "studio",
      kind: "video",
      title: video.title,
      body: video.script,
      media: null,
    });
    if (!piece) throw new Error("No se pudo guardar el video en Biblioteca.");
    return { ...piece, media: null };
  }
  const file = await videoBytes(video.videoUrl);
  if (!file) throw new Error("El video se generó, pero no se pudo descargar en un formato compatible para guardarlo.");
  return saveVegaVideoBytesToLibrary(userId, video.title, video.script, file.bytes, file.contentType);
}

export async function saveVegaVideoBytesToLibrary(
  userId: string,
  title: string,
  script: string,
  bytes: Uint8Array,
  contentType: string,
  pieceId?: string,
) {
  if (!videoTypes.has(contentType) || bytes.byteLength === 0 || bytes.byteLength > maxVideoBytes) {
    throw new Error("El archivo de video tiene un formato o tamaño no compatible.");
  }
  if (pieceId) {
    const existing = await getPrisma().mediaPiece.findFirst({
      where: { id: pieceId, userId, kind: "video", area: "studio" },
      select: { id: true },
    });
    if (!existing) throw new Error("No se encontró el video de Biblioteca que se va a actualizar.");
  }
  const extension = contentType === "video/webm" ? "webm" : "mp4";
  const blob = await put(
    `lyra-vega/${userId}/videos/${crypto.randomUUID()}.${extension}`,
    Buffer.from(bytes),
    { access: "private", contentType },
  );
  if (pieceId) {
    const updated = await getPrisma().mediaPiece.updateMany({
      where: { id: pieceId, userId, kind: "video", area: "studio" },
      data: { media: blob.url },
    });
    if (updated.count !== 1) throw new Error("No se pudo actualizar el video de Biblioteca.");
    const piece = await getPrisma().mediaPiece.findFirstOrThrow({
      where: { id: pieceId, userId },
      select: { id: true, createdAt: true },
    });
    return { id: piece.id, createdAt: piece.createdAt.toISOString(), media: blob.url };
  }
  const piece = await saveCreationForUser(userId, {
    area: "studio",
    kind: "video",
    title,
    body: script,
    media: blob.url,
  });
  if (!piece) throw new Error("No se pudo guardar el video en Biblioteca.");
  return { ...piece, media: blob.url };
}

export async function saveVegaImageToLibrary(userId: string, prompt: string, dataUrl: string) {
  const media = await storeVegaImage({ userId, key: crypto.randomUUID(), prompt, dataUrl });
  const piece = await saveCreationForUser(userId, {
    area: "studio",
    kind: "image",
    title: prompt,
    body: prompt,
    media,
  });
  if (!piece) throw new Error("No se pudo guardar la imagen en Biblioteca.");
  return { ...piece, media };
}
