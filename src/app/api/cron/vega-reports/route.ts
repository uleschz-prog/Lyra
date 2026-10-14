import { NextResponse } from "next/server";

import { authorizeCron } from "@/lib/vega/cron-auth";
import { logVega, safeErrorMessage } from "@/lib/vega/log";
import { runProductionReports } from "@/lib/vega/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!authorizeCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const result = await runProductionReports();
    logVega("info", "vega.reports.done", result);
    return NextResponse.json(result);
  } catch (error) {
    logVega("error", "vega.reports.failed", { message: safeErrorMessage(error) });
    return NextResponse.json({ error: "Los reportes no pudieron enviarse." }, { status: 500 });
  }
}
