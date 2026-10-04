import { Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/prisma";

export const creditPrices = {
  notebook: 5,
  speech: 3,
  search: 2,
  vegaMessage: 1,
  vegaTool: 3,
  botReply: 1,
} as const;

export type Charge =
  | { ok: true; chargeId: string | null; balance: number; duplicate: boolean }
  | { ok: false; error: string; balance: number };

class InsufficientCredits extends Error {}

async function syncWallet(tx: Prisma.TransactionClient, userId: string) {
  const { credits } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } });
  const wallet = await tx.creditWallet.upsert({
    where: { userId },
    create: { userId, balance: credits },
    update: { balance: credits },
  });
  return { credits, walletId: wallet.id };
}

export async function currentCredits(userId: string) {
  const user = await getPrisma().user.findUnique({ where: { id: userId }, select: { credits: true } });
  return user?.credits ?? 0;
}

/**
 * Descuenta créditos de forma atómica. Con `key`, la misma operación nunca se cobra dos veces.
 */
export async function chargeCredits(
  userId: string,
  amount: number,
  description: string,
  key?: string,
): Promise<Charge> {
  const prisma = getPrisma();
  const externalRef = key ? `spend:${key}` : undefined;
  if (amount <= 0) return { ok: true, chargeId: null, balance: await currentCredits(userId), duplicate: false };

  if (externalRef) {
    const existing = await prisma.transaction.findUnique({ where: { externalRef }, select: { id: true } });
    if (existing) return { ok: true, chargeId: existing.id, balance: await currentCredits(userId), duplicate: true };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const taken = await tx.user.updateMany({
        where: { id: userId, credits: { gte: amount } },
        data: { credits: { decrement: amount } },
      });
      if (taken.count === 0) throw new InsufficientCredits();
      const { credits, walletId } = await syncWallet(tx, userId);
      const record = await tx.transaction.create({
        data: {
          userId,
          walletId,
          amount: 0,
          creditDelta: -amount,
          kind: "CREDIT_SPEND",
          description: description.slice(0, 180),
          externalRef,
        },
        select: { id: true },
      });
      return { ok: true as const, chargeId: record.id, balance: credits, duplicate: false };
    });
  } catch (error) {
    const balance = await currentCredits(userId);
    if (error instanceof InsufficientCredits) {
      return { ok: false, error: `Necesitas ${amount} créditos y tienes ${balance}. Recarga en Billetera.`, balance };
    }
    if (externalRef && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.transaction.findUnique({ where: { externalRef }, select: { id: true } });
      return { ok: true, chargeId: existing?.id ?? null, balance, duplicate: true };
    }
    throw error;
  }
}

/** Devuelve un cobro cuando la IA no pudo entregar. Solo se reembolsa una vez. */
export async function refundCharge(chargeId: string | null, reason = "Reembolso: la IA no pudo responder") {
  if (!chargeId) return;
  const prisma = getPrisma();
  const charge = await prisma.transaction.findUnique({
    where: { id: chargeId },
    select: { userId: true, creditDelta: true, kind: true },
  });
  if (!charge || charge.kind !== "CREDIT_SPEND" || charge.creditDelta >= 0) return;
  const amount = -charge.creditDelta;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: charge.userId }, data: { credits: { increment: amount } } });
      const { walletId } = await syncWallet(tx, charge.userId);
      await tx.transaction.create({
        data: {
          userId: charge.userId,
          walletId,
          amount: 0,
          creditDelta: amount,
          kind: "ADJUSTMENT",
          description: reason.slice(0, 180),
          externalRef: `refund:${chargeId}`,
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    throw error;
  }
}

/** Cobra, ejecuta y reembolsa si la tarea falla o no entrega. */
export async function withCharge<T>(
  input: { userId: string; amount: number; description: string; key?: string },
  run: () => Promise<{ ok: true; value: T } | { ok: false; error: string; status?: number }>,
): Promise<
  | { ok: true; value: T; balance: number }
  | { ok: false; error: string; status: number; balance: number }
> {
  const charge = await chargeCredits(input.userId, input.amount, input.description, input.key);
  if (!charge.ok) return { ok: false, error: charge.error, status: 402, balance: charge.balance };
  try {
    const result = await run();
    if (result.ok) return { ok: true, value: result.value, balance: charge.balance };
    await refundCharge(charge.chargeId);
    return { ok: false, error: result.error, status: result.status ?? 502, balance: await currentCredits(input.userId) };
  } catch (error) {
    await refundCharge(charge.chargeId);
    throw error;
  }
}
