import { Prisma } from "@prisma/client";
import { after, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { verifyMetaSignature } from "@/lib/whatsapp/crypto";
import { parseMetaWebhook } from "@/lib/whatsapp/parse";
import { processWhatsappMessage, resolveConnection } from "@/lib/whatsapp/process";

export const maxDuration = 60;

const MAX_BODY = 512 * 1024;

/** Verificación inicial del webhook de Meta (hub.challenge). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && challenge && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(request: Request) {
  if (!process.env.WHATSAPP_APP_SECRET) return NextResponse.json({ ok: false }, { status: 503 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return NextResponse.json({ ok: true });

  const raw = await request.text();
  if (!verifyMetaSignature(process.env.WHATSAPP_APP_SECRET, raw, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { messages, statuses } = parseMetaWebhook(safeParse(raw));
  if (!messages.length && !statuses.length) return NextResponse.json({ ok: true });

  const prisma = getPrisma();
  for (const status of statuses) {
    // Confirmaciones de entrega: marcamos el mensaje saliente correspondiente.
    await prisma.whatsappMessage
      .updateMany({ where: { waMessageId: status.waMessageId, direction: "outbound" }, data: { status: status.status } })
      .catch(() => null);
  }

  for (const inbound of messages) {
    const connection = await resolveConnection(inbound.phoneNumberId).catch(() => null);
    if (!connection) continue;
    let messageRowId: string | null = null;
    try {
      const row = await prisma.whatsappMessage.create({
        data: {
          userId: connection.userId,
          connectionId: connection.id,
          waMessageId: inbound.waMessageId,
          direction: "inbound",
          senderType: "contact",
          text: inbound.text || (inbound.hasMedia ? "(archivo sin texto)" : ""),
          status: "queued",
        },
        select: { id: true },
      });
      messageRowId = row.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      continue;
    }
    await prisma.whatsappConnection.update({ where: { id: connection.id }, data: { lastWebhookAt: new Date() } });
    const rowId = messageRowId;
    after(async () => {
      await processWhatsappMessage(connection.id, inbound, rowId).catch(() => null);
    });
  }

  return NextResponse.json({ ok: true });
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
