import { NextResponse } from "next/server";

import { authorizeCron } from "@/lib/vega/cron-auth";
import { logVega, safeErrorMessage } from "@/lib/vega/log";
import { runProductionIngest } from "@/lib/vega/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!authorizeCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const result = await runProductionIngest();
    logVega("info", "vega.ingest.done", { ...result });
    return NextResponse.json(result);
  } catch (error) {
    logVega("error", "vega.ingest.failed", { message: safeErrorMessage(error) });
    return NextResponse.json({ error: "La ingesta no pudo completarse." }, { status: 500 });
  }
}
