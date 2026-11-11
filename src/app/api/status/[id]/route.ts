import { NextResponse } from "next/server";

import { getHiggsfieldGeneration } from "@/lib/ai/higgsfield-generation";
import { requireMember } from "@/lib/auth/api";

export const maxDuration = 60;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const result = await getHiggsfieldGeneration(guard.user.id, id);
  if (!result) return NextResponse.json({ error: "No encontramos esta generación." }, { status: 404 });
  if (!result.ok) {
    return NextResponse.json({ ...result.generation, error: result.error }, { status: 502 });
  }
  return NextResponse.json(result.generation, { headers: { "Cache-Control": "private, no-store" } });
}
