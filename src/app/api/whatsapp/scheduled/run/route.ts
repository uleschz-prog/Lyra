import { NextResponse } from "next/server";

import { cronAuthError, cronErrorMessage } from "@/lib/cron/auth";
import { runDueWhatsappMessages } from "@/lib/whatsapp/scheduled";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Envía los mensajes de WhatsApp programados que ya vencieron. Lo llama un pinger
 * (GitHub Actions cada 5 min, cron-job.org…) con `Authorization: Bearer $CRON_SECRET`.
 * Cada mensaje se reclama con un `updateMany` condicional (scheduled → sending), así que
 * dos disparos solapados nunca envían el mismo mensaje dos veces.
 */
async function handle(request: Request) {
  const denied = cronAuthError(request, "whatsapp-scheduled");
  if (denied) return denied;
  const started = Date.now();
  console.info(`[cron:whatsapp-scheduled] inicio (${request.method})`);
  try {
    const summary = await runDueWhatsappMessages();
    const counts = Object.entries(summary)
      .map(([key, value]) => `${key}=${value}`)
      .join(" ");
    console.info(`[cron:whatsapp-scheduled] fin en ${Date.now() - started} ms · ${counts}`);
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`[cron:whatsapp-scheduled] error tras ${Date.now() - started} ms: ${cronErrorMessage(error)}`);
    return NextResponse.json({ error: "No se pudieron procesar los mensajes programados; revisa los logs." }, { status: 500 });
  }
}

export function GET(request: Request) {
  return handle(request);
}

export function POST(request: Request) {
  return handle(request);
}
