import { NextResponse } from "next/server";

import { providerError, readJson } from "@/lib/ai/providers";
import { requireMember } from "@/lib/auth/api";
import { getPrisma } from "@/lib/prisma";
import { studioVoices } from "@/lib/ai/voices";

export const maxDuration = 60;

export async function POST(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as { generationId?: unknown } | null;
  const generationId = typeof body?.generationId === "string" ? body.generationId : "";
  if (!generationId) return NextResponse.json({ error: "No se encontró la generación." }, { status: 400 });

  const generation = await getPrisma().videoGeneration.findFirst({
    where: { id: generationId, userId: guard.user.id, status: "assembling" },
    select: { script: true },
  });
  if (!generation) return NextResponse.json({ error: "No se encontró la generación." }, { status: 404 });

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "La narración del video no está configurada." }, { status: 503 });

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${studioVoices[0].id}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: generation.script.slice(0, 2000),
      model_id: "eleven_multilingual_v2",
    }),
  });
  if (!response.ok) {
    const payload = await readJson(response);
    return NextResponse.json(
      { error: providerError(payload, "ElevenLabs no pudo crear la narración.") },
      { status: 502 },
    );
  }
  if (!response.body) {
    return NextResponse.json({ error: "ElevenLabs no devolvió el audio de narración." }, { status: 502 });
  }

  return new Response(response.body, {
    headers: {
      "Content-Type": response.headers.get("content-type") || "audio/mpeg",
      "Cache-Control": "private, no-store",
    },
  });
}
