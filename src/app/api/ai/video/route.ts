import { NextResponse } from "next/server";

import { readOpenRouterVideo } from "@/lib/ai/media";
import {
  downloadHiggsfieldVideo,
  estimateHiggsfieldVideo,
  higgsfieldAspectRatio,
  higgsfieldVideoSegmentDurations,
  isHiggsfieldVideoModel,
} from "@/lib/ai/higgsfield-video";
import { requireMember } from "@/lib/auth/api";
import { isPrivateVideoBlobUrl } from "@/lib/studio/blob-url";
import { getVideoQuotaBalance } from "@/lib/studio/video-quotas";
import {
  advanceVideoGeneration,
  beginVideoGeneration,
  failVideoGeneration,
  finalizeVideoGeneration,
  getCompletedVideoSegment,
} from "@/lib/studio/video-generations";
import { isVideoDuration, isVideoFormat } from "@/lib/studio/video-generation-shared";
import { videoSegmentPrompt } from "@/lib/studio/video-generation-shared";

export const maxDuration = 60;

export async function GET(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const search = new URL(request.url).searchParams;
  const generationId = search.get("generationId");
  const segment = search.get("segment");
  if (generationId && segment !== null) {
    const segmentIndex = Number(segment);
    const segmentFile = await getCompletedVideoSegment(guard.user.id, generationId, segmentIndex);
    if (!segmentFile) return NextResponse.json({ error: "No se encontró el segmento de video." }, { status: 404 });
    if (segmentFile.provider === "higgsfield") {
      const video = await downloadHiggsfieldVideo(segmentFile.source);
      if (!video.ok) return NextResponse.json({ error: video.error }, { status: 502 });
      return new Response(video.body, {
        headers: { "Content-Type": video.contentType, "Cache-Control": "private, no-store" },
      });
    }
    const video = await readOpenRouterVideo(segmentFile.source, true);
    if (!video.ok) return NextResponse.json({ error: video.error }, { status: 502 });
    if (video.status !== "completed" || !("body" in video) || !video.body) {
      return NextResponse.json({ error: "El segmento todavía no está disponible." }, { status: 409 });
    }
    return new Response(video.body, {
      headers: { "Content-Type": video.contentType, "Cache-Control": "private, no-store" },
    });
  }
  if (generationId) {
    const generation = await advanceVideoGeneration(guard.user.id, generationId);
    if (!generation) return NextResponse.json({ error: "No se encontró la generación." }, { status: 404 });
    const quota = await getVideoQuotaBalance(guard.user.id);
    const status = generation.status === "failed" ? 502 : 200;
    return NextResponse.json({ ...generation, quotaRemainingSeconds: quota.remainingSeconds }, { status });
  }

  const jobId = search.get("jobId") ?? "";
  const play = search.get("play") === "1";
  const video = await readOpenRouterVideo(jobId, play);
  if (!video.ok) return NextResponse.json({ error: video.error }, { status: 400 });
  if (video.status !== "completed" || !("body" in video) || !video.body) {
    return NextResponse.json({ status: video.status, jobId: video.jobId });
  }
  if (!play) {
    return NextResponse.json({
      status: "completed",
      jobId: video.jobId,
      videoUrl: `/api/ai/video?jobId=${encodeURIComponent(video.jobId)}&play=1`,
    });
  }
  return new Response(video.body, {
    headers: { "Content-Type": video.contentType, "Cache-Control": "private, max-age=3600" },
  });
}

export async function POST(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    title?: unknown;
    script?: unknown;
    format?: unknown;
    durationSeconds?: unknown;
    model?: unknown;
    requestKey?: unknown;
    generationId?: unknown;
    mediaUrl?: unknown;
    error?: unknown;
  } | null;

  if (body?.action === "finalize") {
    if (typeof body.generationId !== "string" || !isPrivateVideoBlobUrl(body.mediaUrl)) {
      return NextResponse.json({ error: "El archivo final no es válido." }, { status: 400 });
    }
    const result = await finalizeVideoGeneration(guard.user.id, body.generationId, body.mediaUrl);
    return result.ok
      ? NextResponse.json({ status: "completed", piece: result.piece })
      : NextResponse.json({ error: result.error }, { status: 409 });
  }

  if (body?.action === "fail") {
    if (typeof body.generationId !== "string") {
      return NextResponse.json({ error: "No se encontró la generación." }, { status: 400 });
    }
    const generation = await failVideoGeneration(
      guard.user.id,
      body.generationId,
      typeof body.error === "string" ? body.error.slice(0, 1000) : "No se pudo ensamblar o guardar el video.",
    );
    if (!generation) return NextResponse.json({ error: "No se encontró la generación." }, { status: 404 });
    const quota = await getVideoQuotaBalance(guard.user.id);
    return NextResponse.json({ ...generation, quotaRemainingSeconds: quota.remainingSeconds });
  }

  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 80) : "Video LYRA";
  const script = typeof body?.script === "string" ? body.script.trim().slice(0, 2000) : "";
  const format = isVideoFormat(body?.format) ? body.format : "16:9";
  const durationSeconds = body?.durationSeconds;
  const model = body?.model;
  const requestKey = typeof body?.requestKey === "string" ? body.requestKey : "";

  if (script.length < 12) {
    return NextResponse.json({ error: "El guion necesita al menos una frase." }, { status: 400 });
  }
  if (!isVideoDuration(durationSeconds)) {
    return NextResponse.json({ error: "Selecciona una duración entre las opciones disponibles." }, { status: 400 });
  }
  if (!isHiggsfieldVideoModel(model)) {
    return NextResponse.json({ error: "Selecciona Wan 3.0 o Wan 3.0 Prime." }, { status: 400 });
  }
  if (!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(requestKey)) {
    return NextResponse.json({ error: "No se pudo identificar la solicitud. Intenta de nuevo." }, { status: 400 });
  }
  if (!process.env.ELEVENLABS_API_KEY?.trim()) {
    return NextResponse.json({ error: "La narración de video requiere configurar ElevenLabs." }, { status: 503 });
  }
  if (!process.env.HIGGSFIELD_API_KEY_ID?.trim() || !process.env.HIGGSFIELD_API_KEY_SECRET?.trim()) {
    return NextResponse.json({ error: "La generación de video requiere configurar las credenciales de Higgsfield." }, { status: 503 });
  }

  const segmentDurations = higgsfieldVideoSegmentDurations(durationSeconds);
  const prompts = segmentDurations.map((segmentDuration, index) =>
    videoSegmentPrompt(title, script, index, segmentDurations.length, segmentDuration),
  );
  const estimate = await estimateHiggsfieldVideo({
    model,
    prompts,
    durations: segmentDurations,
    aspectRatio: higgsfieldAspectRatio(format),
  });
  if (!estimate.ok) return NextResponse.json({ error: estimate.error }, { status: 502 });

  const started = await beginVideoGeneration({
    userId: guard.user.id,
    requestKey,
    title,
    script,
    format,
    durationSeconds,
    model,
    estimatedCostUsd: estimate.costUsd,
  });
  if (!started.ok) {
    const status = started.code === "quota" ? 402 : started.code === "active" ? 409 : started.code === "cost" ? 422 : 500;
    return NextResponse.json({
      error: started.error,
      ...("quotaRemainingSeconds" in started ? { quotaRemainingSeconds: started.quotaRemainingSeconds } : {}),
    }, { status });
  }

  const generation = await advanceVideoGeneration(guard.user.id, started.generation.id);
  if (!generation) return NextResponse.json({ error: "No se pudo iniciar el video." }, { status: 500 });
  const quota = await getVideoQuotaBalance(guard.user.id);
  const status = generation.status === "failed" ? 502 : 202;
  return NextResponse.json({ ...generation, quotaRemainingSeconds: quota.remainingSeconds }, { status });
}
