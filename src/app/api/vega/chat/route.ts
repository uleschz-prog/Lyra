import { NextResponse } from "next/server";

import { requireMember } from "@/lib/auth/api";
import { canUseVega } from "@/lib/vega/access";
import { prepareAttachments } from "@/lib/vega/attachments";
import type { VegaEvent } from "@/lib/vega/events";
import { vegaConfigured } from "@/lib/vega/gemini-stream";
import { prepareVegaTurn, runVegaTurn } from "@/lib/vega/turn";

export const maxDuration = 60;

export async function POST(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;
  const user = guard.user;
  if (!canUseVega(user)) {
    return NextResponse.json({ error: "Vega está incluida en cualquier membresía activa." }, { status: 403 });
  }
  if (!vegaConfigured()) {
    return NextResponse.json({ error: "Vega no está configurada en el servidor." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    conversationId?: unknown;
    message?: unknown;
    requestId?: unknown;
    attachments?: unknown;
  } | null;
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 4000) : "";
  const requestId = typeof body?.requestId === "string" ? body.requestId.slice(0, 64) : "";
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : null;
  const attachments = await prepareAttachments(body?.attachments);
  if (!attachments.ok) return NextResponse.json({ error: attachments.error }, { status: 400 });
  if (!message && attachments.items.length === 0) {
    return NextResponse.json({ error: "Escribe un mensaje o adjunta un archivo." }, { status: 400 });
  }
  if (!/^[\w-]{8,64}$/.test(requestId)) return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });

  const prepared = await prepareVegaTurn(user, { conversationId, message, requestId, attachments: attachments.items });
  if (!prepared.ok) {
    const { status, error, credits, conversationId: chatId } = prepared;
    return NextResponse.json(
      { error, ...(credits !== undefined ? { credits } : {}), ...(chatId ? { conversationId: chatId } : {}) },
      { status },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: VegaEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      await runVegaTurn(prepared.turn, emit);
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Conversation-Id": prepared.turn.chatId,
    },
  });
}
