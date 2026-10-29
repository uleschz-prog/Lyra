import { Prisma } from "@/generated/prisma/client";

import {
  higgsfieldAspectRatio,
  higgsfieldVideoSegmentDurations,
  isHiggsfieldVideoModel,
  readHiggsfieldVideoStatus,
  submitHiggsfieldVideoSegment,
  type HiggsfieldVideoModel,
} from "@/lib/ai/higgsfield-video";
import { readOpenRouterVideo, submitOpenRouterVideoSegment } from "@/lib/ai/media";
import { currentCredits, refundCharge } from "@/lib/credits";
import { getPrisma } from "@/lib/prisma";
import type { CreationRecord } from "@/lib/media-pieces";
import {
  videoQuotaBaselineUsdPerSecond,
  videoQuotaReservationSeconds,
} from "@/lib/studio/video-quota-shared";
import {
  isVideoFormat,
  videoSegmentPrompt,
  type VideoGenerationState,
} from "@/lib/studio/video-generation-shared";

export type { VideoGenerationState } from "@/lib/studio/video-generation-shared";

function jobIds(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringValues(value: Prisma.JsonValue): string[] {
  return jobIds(value);
}

function numberValues(value: Prisma.JsonValue): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [];
}

function segmentUrl(generationId: string, index: number) {
  return `/api/ai/video?generationId=${encodeURIComponent(generationId)}&segment=${index}`;
}

function toState(
  generation: {
    id: string;
    status: string;
    title: string;
    script: string;
    format: string;
    durationSeconds: number;
    provider: string;
    model: string;
    quotaReservedSeconds: number;
    completedSegments: number;
    segmentCount: number;
    segmentJobIds: Prisma.JsonValue;
    error: string | null;
  },
  balance?: number,
): VideoGenerationState {
  return {
    id: generation.id,
    status: generation.status,
    title: generation.title,
    script: generation.script,
    format: generation.format,
    durationSeconds: generation.durationSeconds,
    model: generation.provider === "higgsfield" && isHiggsfieldVideoModel(generation.model)
      ? generation.model
      : "x-ai/grok-imagine-video-1.5-lite",
    quotaReservedSeconds: generation.quotaReservedSeconds,
    completedSegments: generation.completedSegments,
    segmentCount: generation.segmentCount,
    segmentUrls: jobIds(generation.segmentJobIds).map((_, index) => segmentUrl(generation.id, index)),
    ...(balance === undefined
      ? {}
      : generation.provider === "higgsfield"
        ? { quotaRemainingSeconds: balance }
        : { credits: balance }),
    ...(generation.error ? { error: generation.error } : {}),
  };
}

function creationRecord(piece: {
  id: string;
  title: string;
  body: string;
  media: string | null;
  createdAt: Date;
}): CreationRecord {
  return {
    id: piece.id,
    area: "studio",
    kind: "video",
    title: piece.title,
    body: piece.body,
    media: piece.media,
    createdAt: piece.createdAt.toISOString(),
  };
}

export async function beginVideoGeneration(input: {
  userId: string;
  requestKey: string;
  title: string;
  script: string;
  format: string;
  durationSeconds: number;
  model: HiggsfieldVideoModel;
  estimatedCostUsd: number;
}) {
  const prisma = getPrisma();
  const existing = await prisma.videoGeneration.findUnique({ where: { userId_requestKey: { userId: input.userId, requestKey: input.requestKey } } });
  if (existing) return { ok: true as const, generation: toState(existing) };

  const segmentDurations = higgsfieldVideoSegmentDurations(input.durationSeconds);
  const reservedSeconds = videoQuotaReservationSeconds(input.durationSeconds, input.model);
  if (input.estimatedCostUsd > reservedSeconds * videoQuotaBaselineUsdPerSecond) {
    return {
      ok: false as const,
      code: "cost" as const,
      error: "El costo estimado supera el límite seguro del cupo de video para este modelo.",
    };
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.videoGeneration.findUnique({ where: { userId_requestKey: { userId: input.userId, requestKey: input.requestKey } } });
      if (current) return { kind: "existing" as const, generation: current };
      const active = await tx.videoGeneration.findFirst({
        where: { activeUserId: input.userId },
        select: { id: true },
      });
      if (active) return { kind: "active" as const };

      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { package: true, videoQuotaSeconds: true, videoQuotaExpiresAt: true, videoQuotaCycleId: true },
      });
      if (!user || !user.videoQuotaCycleId || !user.videoQuotaExpiresAt || user.videoQuotaExpiresAt <= new Date()) {
        return { kind: "quota" as const, remaining: 0 };
      }
      if (user.videoQuotaSeconds < reservedSeconds) return { kind: "quota" as const, remaining: user.videoQuotaSeconds };
      const claimed = await tx.user.updateMany({
        where: {
          id: input.userId,
          videoQuotaCycleId: user.videoQuotaCycleId,
          videoQuotaExpiresAt: { gt: new Date() },
          videoQuotaSeconds: { gte: reservedSeconds },
        },
        data: { videoQuotaSeconds: { decrement: reservedSeconds } },
      });
      if (claimed.count === 0) return { kind: "quota" as const, remaining: 0 };
      const generation = await tx.videoGeneration.create({
        data: {
          userId: input.userId,
          activeUserId: input.userId,
          requestKey: input.requestKey,
          provider: "higgsfield",
          model: input.model,
          quotaCycleId: user.videoQuotaCycleId,
          quotaReservedSeconds: reservedSeconds,
          estimatedCostUsd: input.estimatedCostUsd,
          title: input.title.trim().slice(0, 80) || "Video LYRA",
          script: input.script.trim().slice(0, 2000),
          format: isVideoFormat(input.format) ? input.format : "16:9",
          durationSeconds: input.durationSeconds,
          segmentCount: segmentDurations.length,
          segmentDurations,
        },
      });
      const updatedUser = await tx.user.findUniqueOrThrow({
        where: { id: input.userId },
        select: { videoQuotaSeconds: true },
      });
      return { kind: "started" as const, generation, remaining: updatedUser.videoQuotaSeconds };
    });
    if (result.kind === "existing") return { ok: true as const, generation: toState(result.generation) };
    if (result.kind === "active") {
      return { ok: false as const, code: "active" as const, error: "Ya tienes un video en curso. Vuelve al estudio para reanudarlo." };
    }
    if (result.kind === "quota") {
      return {
        ok: false as const,
        code: "quota" as const,
        error: result.remaining > 0
          ? `No tienes segundos suficientes. Te quedan ${result.remaining} segundos; este video requiere ${reservedSeconds}.`
          : "Tu cupo de video terminó o venció. Renueva tu plan para recibir el cupo del siguiente ciclo.",
        quotaRemainingSeconds: result.remaining,
      };
    }
    return { ok: true as const, generation: toState(result.generation, result.remaining) };
  } catch (error) {
    const recovered = await prisma.videoGeneration.findUnique({
      where: { userId_requestKey: { userId: input.userId, requestKey: input.requestKey } },
    });
    if (recovered) return { ok: true as const, generation: toState(recovered) };
    const activeGeneration = await prisma.videoGeneration.findFirst({
      where: { activeUserId: input.userId },
      select: { id: true },
    });
    if (activeGeneration) {
      return {
        ok: false as const,
        code: "active" as const,
        error: "Ya tienes un video en curso. Vuelve al estudio para reanudarlo.",
      };
    }
    throw error;
  }
}

async function ownedGeneration(generationId: string, userId: string) {
  return getPrisma().videoGeneration.findFirst({ where: { id: generationId, userId } });
}

async function failGeneration(generationId: string, reason: string) {
  const prisma = getPrisma();
  const result = await prisma.$transaction(async (tx) => {
    const generation = await tx.videoGeneration.findUnique({ where: { id: generationId } });
    if (!generation || generation.status === "completed" || generation.status === "failed") {
      return {
        generation,
        shouldRefund: generation?.status === "failed" && generation.chargeId !== null,
        ...(generation?.chargeId ? { chargeId: generation.chargeId } : {}),
      };
    }
    const claimed = await tx.videoGeneration.updateMany({
      where: { id: generationId, status: { notIn: ["failed", "completed"] } },
      data: { status: "failed", activeUserId: null, error: reason.slice(0, 1000), currentJobId: null, currentStatusUrl: null },
    });
    if (claimed.count > 0 && generation.quotaCycleId && generation.quotaReservedSeconds > 0) {
      await tx.user.updateMany({
        where: {
          id: generation.userId,
          videoQuotaCycleId: generation.quotaCycleId,
          videoQuotaExpiresAt: { gt: new Date() },
        },
        data: { videoQuotaSeconds: { increment: generation.quotaReservedSeconds } },
      });
    }
    return {
      generation: await tx.videoGeneration.findUnique({ where: { id: generationId } }),
      shouldRefund: claimed.count > 0 && generation.chargeId !== null,
      chargeId: generation.chargeId,
    };
  });
  if ("chargeId" in result && result.shouldRefund && result.chargeId) {
    await refundCharge(result.chargeId, "Reembolso: el video no pudo completarse");
  }
  return result.generation;
}

async function completeGeneration(generationId: string, userId: string, mediaUrl: string) {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.videoGeneration.updateMany({
      where: { id: generationId, userId, status: "assembling" },
      data: { status: "completed", activeUserId: null, currentJobId: null, currentStatusUrl: null, error: null },
    });
    const generation = await tx.videoGeneration.findFirst({ where: { id: generationId, userId } });
    if (!generation) return null;
    if (claimed.count === 0) {
      if (generation.status !== "completed") return null;
      const existingPiece = await tx.mediaPiece.findUnique({ where: { videoGenerationId: generation.id } });
      return existingPiece ? creationRecord(existingPiece) : null;
    }
    const piece = await tx.mediaPiece.upsert({
      where: { videoGenerationId: generation.id },
      create: {
        userId,
        area: "studio",
        kind: "video",
        title: generation.title,
        body: generation.script,
        media: mediaUrl,
        videoGenerationId: generation.id,
      },
      update: {
        title: generation.title,
        body: generation.script,
        media: mediaUrl,
      },
    });
    return creationRecord(piece);
  });
}

export async function finalizeVideoGeneration(userId: string, generationId: string, mediaUrl: string) {
  const generation = await ownedGeneration(generationId, userId);
  if (!generation) return { ok: false as const, error: "No se encontró la generación." };
  if (generation.status === "completed") {
    const piece = await getPrisma().mediaPiece.findUnique({ where: { videoGenerationId: generation.id } });
    if (!piece) return { ok: false as const, error: "No se encontró el video guardado." };
    return {
      ok: true as const,
      piece: piece
        ? ({
            id: piece.id,
            area: "studio",
            kind: "video",
            title: piece.title,
            body: piece.body,
            media: piece.media,
            createdAt: piece.createdAt.toISOString(),
          } satisfies CreationRecord)
        : null,
    };
  }
  if (generation.status !== "assembling") return { ok: false as const, error: "El video todavía no está listo para guardarse." };

  try {
    const piece = await completeGeneration(generationId, userId, mediaUrl);
    return piece ? { ok: true as const, piece } : { ok: false as const, error: "No se pudo guardar el video." };
  } catch {
    await failGeneration(generationId, "No se pudo guardar el archivo final en la biblioteca.");
    return { ok: false as const, error: "No se pudo guardar el video. Se devolvieron los segundos al cupo vigente." };
  }
}

export async function failVideoGeneration(userId: string, generationId: string, reason: string) {
  const generation = await ownedGeneration(generationId, userId);
  if (!generation) return null;
  const failed = await failGeneration(generationId, reason || "No se pudo ensamblar o guardar el video.");
  if (!failed) return null;
  const quota = await getPrisma().user.findUnique({
    where: { id: userId },
    select: { videoQuotaSeconds: true, videoQuotaExpiresAt: true },
  });
  if (failed.provider !== "higgsfield") return toState(failed, await currentCredits(userId));
  return toState(failed, quota?.videoQuotaExpiresAt && quota.videoQuotaExpiresAt > new Date() ? quota.videoQuotaSeconds : 0);
}

export async function getCompletedVideoSegment(userId: string, generationId: string, segmentIndex: number) {
  const generation = await ownedGeneration(generationId, userId);
  if (!generation || !Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex >= generation.completedSegments) {
    return null;
  }
  const source = generation.provider === "higgsfield"
    ? stringValues(generation.segmentVideoUrls)[segmentIndex]
    : jobIds(generation.segmentJobIds)[segmentIndex];
  return source ? { provider: generation.provider, source } : null;
}

async function advanceHiggsfieldGeneration(userId: string, generation: NonNullable<Awaited<ReturnType<typeof ownedGeneration>>>) {
  const prisma = getPrisma();
  if (generation.status === "submitting" && generation.updatedAt.getTime() < Date.now() - 120_000) {
    await prisma.videoGeneration.updateMany({
      where: { id: generation.id, status: "submitting", updatedAt: { lt: new Date(Date.now() - 120_000) } },
      data: { status: "starting" },
    });
    generation = (await ownedGeneration(generation.id, userId))!;
  }

  if (generation.status === "starting") {
    const claimed = await prisma.videoGeneration.updateMany({
      where: { id: generation.id, status: "starting" },
      data: { status: "submitting" },
    });
    if (claimed.count === 0) {
      generation = (await ownedGeneration(generation.id, userId))!;
      return toState(generation);
    }

    const durations = numberValues(generation.segmentDurations);
    const segmentIndex = generation.completedSegments;
    const duration = durations[segmentIndex];
    if (!duration || !isHiggsfieldVideoModel(generation.model)) {
      const failed = await failGeneration(generation.id, "La configuración del segmento de video no es válida.");
      return failed ? toState(failed) : null;
    }
    try {
      const submitted = await submitHiggsfieldVideoSegment({
        model: generation.model,
        prompt: videoSegmentPrompt(generation.title, generation.script, segmentIndex, generation.segmentCount, duration),
        duration,
        aspectRatio: higgsfieldAspectRatio(generation.format),
        idempotencyKey: `${generation.requestKey}-${segmentIndex}`,
      });
      if (!submitted.ok) {
        const failed = await failGeneration(generation.id, submitted.error);
        return failed ? toState(failed) : null;
      }
      const ids = stringValues(generation.segmentJobIds);
      const statusUrls = stringValues(generation.segmentStatusUrls);
      ids[segmentIndex] = submitted.submission.requestId;
      statusUrls[segmentIndex] = submitted.submission.statusUrl;
      await prisma.videoGeneration.updateMany({
        where: { id: generation.id, status: "submitting" },
        data: {
          status: "processing",
          currentJobId: submitted.submission.requestId,
          currentStatusUrl: submitted.submission.statusUrl,
          segmentJobIds: ids,
          segmentStatusUrls: statusUrls,
        },
      });
    } catch {
      await prisma.videoGeneration.updateMany({
        where: { id: generation.id, status: "submitting" },
        data: { status: "starting" },
      });
      return toState((await ownedGeneration(generation.id, userId))!);
    }
    return toState((await ownedGeneration(generation.id, userId))!);
  }

  if (generation.status !== "processing" || !generation.currentStatusUrl) return toState(generation);

  let status: Awaited<ReturnType<typeof readHiggsfieldVideoStatus>>;
  try {
    status = await readHiggsfieldVideoStatus(generation.currentStatusUrl);
  } catch {
    return toState(generation);
  }
  if (!status.ok) return toState(generation);
  if (status.status === "failed" || status.status === "nsfw" || status.status === "canceled") {
    const failed = await failGeneration(generation.id, `Higgsfield terminó el segmento con estado ${status.status}.`);
    return failed ? toState(failed) : null;
  }
  if (status.status !== "completed") return toState(generation);
  if (!status.videoUrl) {
    const failed = await failGeneration(generation.id, "Higgsfield terminó sin entregar el archivo del segmento.");
    return failed ? toState(failed) : null;
  }

  const videoUrls = stringValues(generation.segmentVideoUrls);
  videoUrls[generation.completedSegments] = status.videoUrl;
  const completedSegments = generation.completedSegments + 1;
  const updated = await prisma.videoGeneration.updateMany({
    where: {
      id: generation.id,
      status: "processing",
      currentJobId: generation.currentJobId,
      completedSegments: generation.completedSegments,
    },
    data: {
      completedSegments,
      segmentVideoUrls: videoUrls,
      currentJobId: null,
      currentStatusUrl: null,
      status: completedSegments === generation.segmentCount ? "assembling" : "starting",
    },
  });
  if (updated.count === 0) return toState((await ownedGeneration(generation.id, userId))!);
  generation = (await ownedGeneration(generation.id, userId))!;
  if (generation.status === "starting") return advanceVideoGeneration(userId, generation.id);
  return toState(generation);
}

export async function advanceVideoGeneration(userId: string, generationId: string): Promise<VideoGenerationState | null> {
  const prisma = getPrisma();
  let generation = await ownedGeneration(generationId, userId);
  if (!generation) return null;
  if (generation.status === "completed") {
    const piece = await prisma.mediaPiece.findUnique({ where: { videoGenerationId: generation.id } });
    return {
      ...toState(generation),
      ...(piece
        ? {
            piece: {
              id: piece.id,
              area: "studio" as const,
              kind: "video" as const,
              title: piece.title,
              body: piece.body,
              media: piece.media,
              createdAt: piece.createdAt.toISOString(),
            },
          }
        : {}),
    };
  }
  if (generation.status === "failed" || generation.status === "assembling") {
    return generation.status === "failed" && generation.provider !== "higgsfield"
      ? toState(generation, await currentCredits(userId))
      : toState(generation);
  }
  if (generation.provider === "higgsfield") return advanceHiggsfieldGeneration(userId, generation);

  if (generation.status === "submitting" && generation.updatedAt.getTime() < Date.now() - 120_000) {
    await prisma.videoGeneration.updateMany({
      where: { id: generation.id, status: "submitting", updatedAt: { lt: new Date(Date.now() - 120_000) } },
      data: { status: "starting" },
    });
    generation = (await ownedGeneration(generationId, userId))!;
  }

  if (generation.status === "starting") {
    const claimed = await prisma.videoGeneration.updateMany({
      where: { id: generation.id, status: "starting" },
      data: { status: "submitting" },
    });
    if (claimed.count === 0) {
      generation = (await ownedGeneration(generationId, userId))!;
      return toState(generation);
    }

    const index = generation.completedSegments;
    const prompt = videoSegmentPrompt(generation.title, generation.script, index, generation.segmentCount, 15);
    try {
      const submitted = await submitOpenRouterVideoSegment({ prompt, format: generation.format });
      if (!submitted.ok) {
        const failed = await failGeneration(generation.id, submitted.error);
        return failed ? toState(failed, await currentCredits(userId)) : null;
      }
      const ids = jobIds(generation.segmentJobIds);
      ids[index] = submitted.jobId;
      await prisma.videoGeneration.updateMany({
        where: { id: generation.id, status: "submitting" },
        data: { status: "processing", currentJobId: submitted.jobId, segmentJobIds: ids },
      });
    } catch {
      const failed = await failGeneration(generation.id, "OpenRouter no pudo iniciar el segmento de video.");
      return failed ? toState(failed, await currentCredits(userId)) : null;
    }
    generation = (await ownedGeneration(generationId, userId))!;
    return toState(generation);
  }

  if (generation.status !== "processing" || !generation.currentJobId) return toState(generation);

  let video: Awaited<ReturnType<typeof readOpenRouterVideo>>;
  try {
    video = await readOpenRouterVideo(generation.currentJobId, false);
  } catch {
    return toState(generation);
  }
  if (!video.ok) {
    const failed = await failGeneration(generation.id, video.error);
    return failed ? toState(failed, await currentCredits(userId)) : null;
  }
  if (video.status === "failed" || video.status === "cancelled" || video.status === "expired") {
    const failed = await failGeneration(generation.id, "OpenRouter no pudo completar el segmento de video.");
    return failed ? toState(failed, await currentCredits(userId)) : null;
  }
  if (video.status !== "completed") return toState(generation);

  const completedSegments = generation.completedSegments + 1;
  const updated = await prisma.videoGeneration.updateMany({
    where: {
      id: generation.id,
      status: "processing",
      currentJobId: generation.currentJobId,
      completedSegments: generation.completedSegments,
    },
    data: {
      completedSegments,
      currentJobId: null,
      status: completedSegments === generation.segmentCount ? "assembling" : "starting",
    },
  });
  if (updated.count === 0) {
    generation = (await ownedGeneration(generationId, userId))!;
    return toState(generation);
  }
  generation = (await ownedGeneration(generationId, userId))!;
  if (generation.status === "starting") return advanceVideoGeneration(userId, generationId);
  return toState(generation);
}

export async function getActiveVideoGeneration(userId: string): Promise<VideoGenerationState | null> {
  const generation = await getPrisma().videoGeneration.findFirst({
    where: { activeUserId: userId, status: { notIn: ["completed", "failed"] } },
    orderBy: { createdAt: "desc" },
  });
  return generation ? toState(generation) : null;
}
