import { NextResponse } from "next/server";

import { cronAuthError } from "@/lib/cron/auth";
import { monthFromKey } from "@/lib/compensation/activity";
import { closeMonth } from "@/lib/compensation/close";

export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = cronAuthError(request, "commissions-close");
  if (denied) return denied;

  const requested = new URL(request.url).searchParams.get("mes");
  const now = new Date();
  const month = requested ? monthFromKey(requested) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  if (!month) return NextResponse.json({ error: "Mes inválido." }, { status: 400 });

  const result = await closeMonth(month);
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
