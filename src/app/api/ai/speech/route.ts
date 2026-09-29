import { NextResponse } from "next/server";

import { providerError, readJson } from "@/lib/ai/providers";
import { isStudioVoice, studioVoices } from "@/lib/ai/voices";
import { requireMember } from "@/lib/auth/api";
import { creditPrices, withCharge } from "@/lib/credits";

export const maxDuration = 60;

export async function POST(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as {
    text?: unknown;
    voiceId?: unknown;
  } | null;

  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 2500) : "";
  const voiceId = typeof body?.voiceId === "string" ? body.voiceId : studioVoices[0].id;

  if (!text) {
    return NextResponse.json({ error: "Escribe el texto que quieres escuchar." }, { status: 400 });
  }

  if (!isStudioVoice(voiceId)) {
    return NextResponse.json({ error: "Esa voz no está disponible." }, { status: 400 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      mode: "preview",
      voiceId,
      message: "La reproducción usa la voz del navegador hasta configurar ELEVENLABS_API_KEY.",
    });
  }

  const result = await withCharge(
    { userId: guard.user.id, amount: creditPrices.speech, description: "Voz · narración" },
    async () => {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
        }),
      });
      if (!response.ok) {
        const payload = await readJson(response);
        return { ok: false as const, error: providerError(payload, "ElevenLabs no pudo sintetizar la voz.") };
      }
      return { ok: true as const, value: await response.arrayBuffer() };
    },
  );
  if (!result.ok) return NextResponse.json({ error: result.error, credits: result.balance }, { status: result.status });

  return new NextResponse(result.value, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "X-Lyra-Credits": String(result.balance),
    },
  });
}
