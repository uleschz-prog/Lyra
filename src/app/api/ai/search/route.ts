import { NextResponse } from "next/server";

import { searchWeb } from "@/lib/ai/search";
import { requireMember } from "@/lib/auth/api";
import { creditPrices, withCharge } from "@/lib/credits";

export const maxDuration = 30;

export async function POST(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as { query?: unknown } | null;
  const query = typeof body?.query === "string" ? body.query.trim().slice(0, 300) : "";

  if (query.length < 3) {
    return NextResponse.json({ error: "Escribe una búsqueda de al menos tres caracteres." }, { status: 400 });
  }

  if (!process.env.EXA_API_KEY) {
    return NextResponse.json({
      mode: "unconfigured",
      results: [],
      message: "Conecta EXA_API_KEY para consultar tendencias y mercado en vivo.",
    });
  }

  const result = await withCharge(
    { userId: guard.user.id, amount: creditPrices.search, description: `Búsqueda · ${query.slice(0, 60)}` },
    () => searchWeb(query),
  );
  if (!result.ok) return NextResponse.json({ error: result.error, credits: result.balance }, { status: result.status });

  return NextResponse.json({ mode: "live", results: result.value, credits: result.balance });
}
