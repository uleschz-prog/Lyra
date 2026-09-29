import { NextResponse } from "next/server";

import { runDueTasks } from "@/lib/vega/tasks";

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const result = await runDueTasks();
  return NextResponse.json(result);
}
