import { NextResponse } from "next/server";

import { createSoulReference, listSoulReferences, parseSoulReferenceInput } from "@/lib/ai/higgsfield-references";
import { requireMember } from "@/lib/auth/api";

export async function GET() {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const result = await listSoulReferences();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ references: result.references });
}

export async function POST(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const input = parseSoulReferenceInput(body);
  if (!input) {
    return NextResponse.json(
      { error: "Indica un nombre y entre 1 y 100 URLs de imagen HTTPS distintas." },
      { status: 400 },
    );
  }

  const result = await createSoulReference(input.name, input.imageUrls);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ reference: result.reference }, { status: 201 });
}
