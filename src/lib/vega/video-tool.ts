import { generateClip, runwayClipSeconds, type ClipResult } from "@/lib/ai/media";
import { getPrisma } from "@/lib/prisma";
import { saveVegaVideoToLibrary } from "@/lib/vega/library-media";

/**
 * crear_video de Vega (PR A): respeta la cuota de segundos de video del plan y ya no entrega
 * «storyboards» de texto como si fueran video. Si el clip no sale, la cuota se devuelve,
 * la herramienta falla (así el turno reembolsa el crédito de herramienta) y Runway se cancela.
 * La migración completa al pipeline asíncrono de Higgsfield + ElevenLabs es el PR G.
 */

export type QuotaReservation = { cycleId: string | null; seconds: number };

export type VideoToolDeps = {
  reserve: (userId: string, seconds: number, now: Date) => Promise<QuotaReservation | null>;
  release: (userId: string, reservation: QuotaReservation) => Promise<void>;
  clip: (input: { title: string; script: string; format: string }) => Promise<ClipResult>;
  save: (userId: string, video: { title: string; script: string; videoUrl: string }) => Promise<{ id: string; media: string | null }>;
  clipSeconds: () => number;
};

export type VideoToolOutcome =
  | { ok: false; error: string }
  | {
      ok: true;
      title: string;
      script: string;
      videoUrl: string;
      libraryPieceId?: string;
      savedToLibrary: boolean;
      seconds: number;
    };

/** Descuenta segundos de la cuota sólo si alcanzan y el ciclo sigue vigente (atómico). */
async function reserveQuota(userId: string, seconds: number, now: Date): Promise<QuotaReservation | null> {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { videoQuotaCycleId: true } });
  if (!user) return null;
  const updated = await prisma.user.updateMany({
    where: {
      id: userId,
      videoQuotaCycleId: user.videoQuotaCycleId,
      videoQuotaSeconds: { gte: seconds },
      videoQuotaExpiresAt: { gt: now },
    },
    data: { videoQuotaSeconds: { decrement: seconds } },
  });
  return updated.count === 1 ? { cycleId: user.videoQuotaCycleId, seconds } : null;
}

/** Devuelve los segundos al mismo ciclo; si el ciclo ya cambió, no suma nada. */
async function releaseQuota(userId: string, reservation: QuotaReservation) {
  await getPrisma().user.updateMany({
    where: { id: userId, videoQuotaCycleId: reservation.cycleId },
    data: { videoQuotaSeconds: { increment: reservation.seconds } },
  });
}

export const defaultVideoToolDeps: VideoToolDeps = {
  reserve: reserveQuota,
  release: releaseQuota,
  clip: (input) => generateClip({ ...input, duration: "15 s", styleId: "cine" }),
  save: (userId, video) => saveVegaVideoToLibrary(userId, { ...video, scenes: [], html: "", files: [] }),
  clipSeconds: () => runwayClipSeconds(),
};

export const videoQuotaExhaustedMessage =
  "Ya no te quedan segundos de video en este ciclo de tu plan. Se renuevan con tu siguiente recarga o puedes mejorar tu plan.";

export async function runCreateVideo(
  userId: string,
  input: { title: string; script: string; format: string },
  deps: VideoToolDeps = defaultVideoToolDeps,
  now = new Date(),
): Promise<VideoToolOutcome> {
  const seconds = deps.clipSeconds();
  const reservation = await deps.reserve(userId, seconds, now);
  if (!reservation) return { ok: false, error: videoQuotaExhaustedMessage };

  let clip: ClipResult;
  try {
    clip = await deps.clip(input);
  } catch {
    clip = { ok: false, error: "No se pudo crear el video." };
  }
  if (!clip.ok) {
    await deps.release(userId, reservation);
    const reason = "error" in clip ? clip.error : "El video no terminó a tiempo.";
    return { ok: false, error: `${reason} No se descontó tu cuota de video.` };
  }

  // El clip ya existe (y ya costó): la cuota queda usada aunque Biblioteca falle.
  try {
    const saved = await deps.save(userId, { title: input.title, script: input.script, videoUrl: clip.url });
    return {
      ok: true,
      title: input.title,
      script: input.script,
      videoUrl: saved.media ? `/api/library/video?pieceId=${encodeURIComponent(saved.id)}` : clip.url,
      libraryPieceId: saved.id,
      savedToLibrary: Boolean(saved.media),
      seconds,
    };
  } catch {
    return { ok: true, title: input.title, script: input.script, videoUrl: clip.url, savedToLibrary: false, seconds };
  }
}
