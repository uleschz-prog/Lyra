import { NextResponse } from "next/server";

import { ListeningLimitError, parseListeningInput } from "@/lib/vega/input";
import { logVega, safeErrorMessage } from "@/lib/vega/log";
import { requireVegaUser } from "@/lib/vega/session";
import { addListening, readListening } from "@/lib/vega/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireVegaUser();
  if (!session.user) return session.response;
  try {
    return NextResponse.json(await readListening(session.user.id));
  } catch (error) {
    logVega("error", "vega.listening.read_failed", { userId: session.user.id, message: safeErrorMessage(error) });
    return NextResponse.json({ error: "No se pudo leer la escucha." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireVegaUser();
  if (!session.user) return session.response;
  const parsed = parseListeningInput(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const saved = await addListening(session.user.id, parsed);
    return NextResponse.json({ keywords: saved.keywords, competitors: saved.competitors });
  } catch (error) {
    if (error instanceof ListeningLimitError) return NextResponse.json({ error: error.message }, { status: 400 });
    logVega("error", "vega.listening.write_failed", { userId: session.user.id, message: safeErrorMessage(error) });
    return NextResponse.json({ error: "No se pudo guardar la escucha." }, { status: 500 });
  }
}
