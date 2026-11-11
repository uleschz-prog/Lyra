import { NextResponse } from "next/server";

import { generateClip, readOpenRouterVideo, type VideoQuality } from "@/lib/ai/media";
import { requireMember } from "@/lib/auth/api";
import { creditPrices, withCharge } from "@/lib/credits";
import { scenesFromScript } from "@/lib/studio/video-plan";

export const maxDuration = 60;

function qualityOf(value: unknown): VideoQuality | undefined {
  return value === "4K" || value === "1080p" ? value : undefined;
}

export async function GET(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const jobId = new URL(request.url).searchParams.get("jobId") ?? "";
  const play = new URL(request.url).searchParams.get("play") === "1";
  const video = await readOpenRouterVideo(jobId, play);
  if (!video.ok) return NextResponse.json({ error: video.error }, { status: 400 });
  if (video.status !== "completed" || !("body" in video) || !video.body) {
    return NextResponse.json({ status: video.status, jobId: video.jobId });
  }
  if (!play) return NextResponse.json({ status: "completed", jobId: video.jobId, videoUrl: `/api/ai/video?jobId=${video.jobId}&play=1` });
  return new Response(video.body, {
    headers: { "Content-Type": video.contentType, "Cache-Control": "private, max-age=3600" },
  });
}

export async function POST(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    script?: unknown;
    format?: unknown;
    styleId?: unknown;
    duration?: unknown;
    captions?: unknown;
    quality?: unknown;
  } | null;

  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 80) : "Pieza LYRA";
  const script = typeof body?.script === "string" ? body.script.trim().slice(0, 2000) : "";
  const format = typeof body?.format === "string" ? body.format : "9:16";
  const styleId = typeof body?.styleId === "string" ? body.styleId : "vlog";
  const duration = typeof body?.duration === "string" ? body.duration : "15 s";
  const captions = body?.captions === false || body?.captions === "Sin subtítulos" ? false : true;

  if (script.length < 12) {
    return NextResponse.json({ error: "El guion necesita al menos una frase." }, { status: 400 });
  }

  const scenes = scenesFromScript(script);

  type VideoCharge =
    | { status: "processing"; provider: string; jobId: string; message: string }
    | { status: "completed"; provider: string; videoUrl: string; message: string };

  const result = await withCharge<VideoCharge>(
    { userId: guard.user.id, amount: creditPrices.video, description: "Video · estudio" },
    async () => {
      const clip = await generateClip(
        { title, script, format, styleId, duration, captions, quality: qualityOf(body?.quality) },
        45_000,
      );
      // El trabajo aceptado (aunque siga procesando) no se reembolsa.
      if (!clip.ok && "pending" in clip && clip.pending) {
        return {
          ok: true as const,
          value: {
            status: "processing" as const,
            provider: "openrouter",
            jobId: clip.jobId,
            message: clip.note,
          },
        };
      }
      if (clip.ok) {
        return {
          ok: true as const,
          value: {
            status: "completed" as const,
            provider: clip.url.includes("jobId=") ? "openrouter" : "runway",
            videoUrl: clip.url,
            message: clip.note,
          },
        };
      }
      return { ok: false as const, error: "error" in clip ? clip.error : "No se pudo crear el video." };
    },
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error, credits: result.balance }, { status: result.status });
  }

  if (result.value.status === "processing") {
    return NextResponse.json({
      mode: "live",
      provider: result.value.provider,
      title,
      status: "processing",
      jobId: result.value.jobId,
      scenes,
      message: result.value.message,
      credits: result.balance,
    });
  }
  return NextResponse.json({
    mode: "live",
    provider: result.value.provider,
    title,
    status: "completed",
    videoUrl: result.value.videoUrl,
    scenes,
    message: result.value.message,
    credits: result.balance,
  });
}
