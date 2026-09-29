import { NextResponse } from "next/server";

import { monthFromKey } from "@/lib/compensation/activity";
import { closeMonth } from "@/lib/compensation/close";

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const requested = new URL(request.url).searchParams.get("mes");
  const now = new Date();
  const month = requested ? monthFromKey(requested) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  if (!month) return NextResponse.json({ error: "Mes inválido." }, { status: 400 });

  const result = await closeMonth(month);
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
