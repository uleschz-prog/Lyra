import { NextResponse } from "next/server";

import { generateClip } from "@/lib/ai/media";
import { requireMember } from "@/lib/auth/api";
import { scenesFromScript } from "@/lib/studio/video-plan";

export const maxDuration = 60;

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

  const clip = await generateClip({ title, script, format, styleId, duration, captions }, 45_000);
  if (clip.ok) {
    return NextResponse.json({
      mode: "live",
      provider: "lyra",
      title,
      status: "completed",
      videoUrl: clip.url,
      scenes,
      message: "Video listo. Puedes guardarlo, editarlo o eliminarlo.",
    });
  }
  return NextResponse.json({
    mode: "preview",
    provider: "lyra",
    title,
    status: "ready",
    scenes,
    message: "El servidor no pudo escribir el archivo. El estudio lo graba en el navegador.",
  });
}
