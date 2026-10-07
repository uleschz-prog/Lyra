import { NextResponse } from "next/server";

import { generateStill } from "@/lib/ai/media";
import { requireMember } from "@/lib/auth/api";
import { creditPrices, withCharge } from "@/lib/credits";

export const maxDuration = 60;

export async function POST(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as {
    prompt?: unknown;
    size?: unknown;
  } | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, 1200) : "";
  const size = typeof body?.size === "string" ? body.size : "1:1";
  if (prompt.length < 4) {
    return NextResponse.json({ error: "Describe la imagen con un poco más de detalle." }, { status: 400 });
  }

  const result = await withCharge(
    { userId: guard.user.id, amount: creditPrices.image, description: "Imagen · estudio" },
    async () => {
      const image = await generateStill(prompt, size);
      return image.ok ? { ok: true as const, value: image } : { ok: false as const, error: image.error };
    },
  );
  if (!result.ok) return NextResponse.json({ error: result.error, credits: result.balance }, { status: result.status });

  return NextResponse.json({
    mode: "live",
    dataUrl: result.value.dataUrl,
    note: result.value.note,
    credits: result.balance,
  });
}
