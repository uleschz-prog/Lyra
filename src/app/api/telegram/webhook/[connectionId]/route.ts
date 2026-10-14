import { Prisma } from "@prisma/client";
import { after, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { sameHash } from "@/lib/telegram/crypto";
import { runDueFollowups } from "@/lib/telegram/followups";
import { logTelegram } from "@/lib/telegram/log";
import { parseUpdate } from "@/lib/telegram/parse";
import { processUpdate } from "@/lib/telegram/process";

export const maxDuration = 60;

const MAX_BODY = 512 * 1024;
let lastSweep = 0;

export async function POST(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  const secret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!/^c[a-z0-9]{20,32}$/.test(connectionId) || !secret || secret.length > 256) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const prisma = getPrisma();
  const connection = await prisma.telegramConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, userId: true, status: true, secretHash: true },
  });
  if (!connection || connection.status === "disconnected" || !connection.secretHash || !sameHash(secret, connection.secretHash)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return NextResponse.json({ ok: true });
  const inbound = parseUpdate(await request.json().catch(() => null));
  if (!inbound) return NextResponse.json({ ok: true });

  let messageRowId: string | null = null;
  try {
    const row = await prisma.telegramMessage.create({
      data: {
        userId: connection.userId,
        connectionId,
        direction: "inbound",
        senderType: "contact",
        updateId: BigInt(inbound.updateId),
        tgMessageId: inbound.messageId ? BigInt(inbound.messageId) : null,
        text: inbound.text || (inbound.hasMedia ? "(archivo sin texto)" : inbound.callbackData ? `[botón] ${inbound.callbackData}` : `[${inbound.kind}]`),
        status: "queued",
      },
      select: { id: true },
    });
    messageRowId = row.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      logTelegram("duplicate_update", { userId: connection.userId, connectionId, updateId: inbound.updateId });
      return NextResponse.json({ ok: true });
    }
    logTelegram("store_error", { userId: connection.userId, connectionId, updateId: inbound.updateId });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  await prisma.telegramConnection.update({ where: { id: connectionId }, data: { lastWebhookAt: new Date() } });

  after(async () => {
    await processUpdate(connectionId, inbound, messageRowId);
    if (Date.now() - lastSweep > 60_000) {
      lastSweep = Date.now();
      await runDueFollowups(8_000, 5).catch(() => null);
    }
  });

  return NextResponse.json({ ok: true });
}
