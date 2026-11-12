import { NextResponse } from "next/server";

import { getSoulReference, parseSoulReferenceId } from "@/lib/ai/higgsfield-references";
import { requireMember } from "@/lib/auth/api";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const referenceId = parseSoulReferenceId(id);
  if (!referenceId) return NextResponse.json({ error: "El ID de Soul ID no es válido." }, { status: 400 });

  const result = await getSoulReference(referenceId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ reference: result.reference });
}
