import { NextResponse } from "next/server";

import { requireMember } from "@/lib/auth/api";
import { advanceVegaImage } from "@/lib/vega/image-generation";

export const maxDuration = 30;

export async function GET(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const actionId = new URL(request.url).searchParams.get("actionId") ?? "";
  if (!/^[\w-]{8,64}$/.test(actionId)) {
    return NextResponse.json({ error: "La solicitud de imagen no es válida." }, { status: 400 });
  }

  const action = await advanceVegaImage(guard.user.id, actionId);
  if (!action) return NextResponse.json({ error: "No encontramos esta imagen." }, { status: 404 });
  return NextResponse.json({ action }, { headers: { "Cache-Control": "private, no-store" } });
}
