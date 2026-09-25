import { NextResponse } from "next/server";

import { aiPricing } from "@/config/ai-pricing";
import { aiJson, chargeAiCall, idempotencyKeyFrom, requireAiUser, withCreditHeader } from "@/lib/ai/guard";
import { providerError, readJson } from "@/lib/ai/providers";
import { isStudioVoice, studioVoices } from "@/lib/ai/voices";
import { readCreditBalance } from "@/lib/credits/ledger";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await requireAiUser();
  if (!session.user) return session.response;
  const user = session.user;

  const body = (await request.json().catch(() => null)) as {
    text?: unknown;
    voiceId?: unknown;
    idempotencyKey?: unknown;
  } | null;

  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 2500) : "";
  const voiceId = typeof body?.voiceId === "string" ? body.voiceId : studioVoices[0].id;

  if (!text) {
    return aiJson({ error: "Escribe el texto que quieres escuchar." }, 400, user.credits);
  }

  if (!isStudioVoice(voiceId)) {
    return aiJson({ error: "Esa voz no está disponible." }, 400, user.credits);
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return aiJson(
      {
        mode: "preview",
        charged: 0,
        voiceId,
        message: "La reproducción usa la voz del navegador hasta configurar ELEVENLABS_API_KEY.",
      },
      200,
      await readCreditBalance(user.id),
    );
  }

  const paid = await chargeAiCall({
    userId: user.id,
    cost: aiPricing.speech,
    reason: "ai.speech",
    description: "Voz del estudio",
    idempotencyKey: idempotencyKeyFrom(request, body?.idempotencyKey),
    metadata: { voiceId },
    execute: async () => {
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
        throw new Error(providerError(payload, "ElevenLabs no pudo sintetizar la voz."));
      }

      return response.arrayBuffer();
    },
  });

  if (!paid.ok) return aiJson({ error: paid.error }, paid.status, paid.balance);

  return withCreditHeader(
    new NextResponse(paid.value, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "x-credit-balance": String(paid.balance),
        "x-credit-charged": String(paid.charged),
      },
    }),
    paid.balance,
  );
}
