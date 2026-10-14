import { NextResponse } from "next/server";

import { parseScheduleInput } from "@/lib/vega/input";
import { logVega, safeErrorMessage } from "@/lib/vega/log";
import { requireVegaUser } from "@/lib/vega/session";
import { setSchedule } from "@/lib/vega/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireVegaUser();
  if (!session.user) return session.response;
  const parsed = parseScheduleInput(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const schedule = await setSchedule(session.user.id, parsed.cadence, parsed.enabled);
    return NextResponse.json({
      cadence: schedule.cadence,
      enabled: schedule.enabled,
      lastSentAt: schedule.lastSentAt?.toISOString() ?? null,
      recipient: session.user.email,
    });
  } catch (error) {
    logVega("error", "vega.schedule.failed", { userId: session.user.id, message: safeErrorMessage(error) });
    return NextResponse.json({ error: "No se pudo guardar el reporte programado." }, { status: 500 });
  }
}
