import { NextResponse } from "next/server";

import { logVega, safeErrorMessage } from "@/lib/vega/log";
import { askVega } from "@/lib/vega/runtime";
import { llmFailure, requireVegaUser } from "@/lib/vega/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await requireVegaUser();
  if (!session.user) return session.response;
  const body = (await request.json().catch(() => null)) as { goal?: unknown } | null;
  const goal = typeof body?.goal === "string" ? body.goal.trim().slice(0, 1000) : "";
  if (goal.length < 2) return NextResponse.json({ error: "Escribe qué quieres que Vega investigue." }, { status: 400 });

  try {
    const result = await askVega({ userId: session.user.id, packageId: session.user.package, goal });
    return NextResponse.json(result);
  } catch (error) {
    const mapped = llmFailure(error);
    if (mapped) return mapped;
    logVega("error", "vega.ask.failed", { userId: session.user.id, message: safeErrorMessage(error) });
    return NextResponse.json({ error: "Vega no pudo completar la consulta." }, { status: 500 });
  }
}
