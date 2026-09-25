import { Prisma, type PrismaClient, type TransactionKind } from "@prisma/client";

import { canonicalBalance, planLedgerOp } from "@/lib/credits/ledger-logic";
import { getPrisma } from "@/lib/prisma";
import type { WalletTransaction } from "@/lib/types";

type Tx = Prisma.TransactionClient;

const maxCredits = 1_000_000;

export type LedgerResult =
  | { ok: true; balance: number; already: boolean; transactionId: string; transaction: WalletTransaction }
  | { ok: false; code: "insufficient" | "invalid" | "missing"; balance: number };

export type LedgerWrite = {
  userId: string;
  delta: number;
  amountUsd?: number;
  externalRef?: string | null;
  kind: TransactionKind;
  reason: string;
  description: string;
  metadata?: Prisma.InputJsonValue;
};

function toTransaction(row: {
  id: string;
  description: string;
  amount: Prisma.Decimal | number;
  creditDelta: number;
  kind: TransactionKind;
  createdAt: Date;
}): WalletTransaction {
  return {
    id: row.id,
    description: row.description,
    amountUsd: Number(row.amount),
    creditDelta: row.creditDelta,
    kind: row.kind,
    createdAt: row.createdAt.toISOString(),
  };
}

async function applyInTx(tx: Tx, input: LedgerWrite): Promise<LedgerResult> {
  if (!Number.isInteger(input.delta) || input.delta === 0 || Math.abs(input.delta) > maxCredits) {
    return { ok: false, code: "invalid", balance: 0 };
  }

  const locked = await tx.$queryRaw<Array<{ id: string; credits: number }>>`
    SELECT id, credits FROM "User" WHERE id = ${input.userId} FOR UPDATE
  `;
  const user = locked[0];
  if (!user) return { ok: false, code: "missing", balance: 0 };

  await tx.creditWallet.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId, balance: user.credits },
    update: {},
  });

  const wallet = await tx.creditWallet.findUnique({
    where: { userId: input.userId },
    select: { id: true, balance: true },
  });
  if (!wallet) return { ok: false, code: "missing", balance: user.credits };

  const externalRef = input.externalRef?.trim() || null;
  const existing = externalRef
    ? await tx.transaction.findUnique({
        where: { externalRef },
        select: {
          id: true,
          userId: true,
          description: true,
          amount: true,
          creditDelta: true,
          kind: true,
          createdAt: true,
        },
      })
    : null;

  if (existing && existing.userId !== input.userId) {
    return { ok: false, code: "invalid", balance: canonicalBalance(user.credits, wallet.balance) };
  }

  const plan = planLedgerOp({
    userCredits: user.credits,
    walletBalance: wallet.balance,
    delta: input.delta,
    hasExistingRef: Boolean(existing),
  });

  if (plan.action === "replay" && existing) {
    await mirror(tx, input.userId, wallet.id, user.credits, wallet.balance, plan.balance);
    return {
      ok: true,
      balance: plan.balance,
      already: true,
      transactionId: existing.id,
      transaction: toTransaction(existing),
    };
  }

  if (plan.action === "reject") {
    await mirror(tx, input.userId, wallet.id, user.credits, wallet.balance, plan.balance);
    return { ok: false, code: plan.code, balance: plan.balance };
  }

  const updatedUser = await tx.user.updateMany({
    where: { id: input.userId, credits: user.credits },
    data: { credits: plan.balance },
  });
  const updatedWallet = await tx.creditWallet.updateMany({
    where: { id: wallet.id, balance: wallet.balance },
    data: { balance: plan.balance },
  });
  if (updatedUser.count !== 1 || updatedWallet.count !== 1) {
    throw new Error("El saldo cambió durante el movimiento de créditos.");
  }

  const entry = await tx.transaction.create({
    data: {
      userId: input.userId,
      walletId: wallet.id,
      amount: input.amountUsd ?? 0,
      creditDelta: input.delta,
      kind: input.kind,
      description: input.description.slice(0, 500),
      externalRef,
      reason: input.reason.slice(0, 80),
      metadata: input.metadata,
    },
    select: {
      id: true,
      description: true,
      amount: true,
      creditDelta: true,
      kind: true,
      createdAt: true,
    },
  });

  return {
    ok: true,
    balance: plan.balance,
    already: false,
    transactionId: entry.id,
    transaction: toTransaction(entry),
  };
}

async function mirror(tx: Tx, userId: string, walletId: string, userCredits: number, walletBalance: number, balance: number) {
  if (userCredits === balance && walletBalance === balance) return;
  await tx.user.update({ where: { id: userId }, data: { credits: balance } });
  await tx.creditWallet.update({ where: { id: walletId }, data: { balance } });
}

async function run(input: LedgerWrite, tx?: Tx) {
  if (tx) return applyInTx(tx, input);
  return getPrisma().$transaction((db) => applyInTx(db, input));
}

function positive(credits: number) {
  return Number.isInteger(credits) && credits > 0 && credits <= maxCredits;
}

export async function applyCredits(input: LedgerWrite, tx?: Tx) {
  return run(input, tx);
}

export async function debitCredits(
  input: Omit<LedgerWrite, "delta" | "kind"> & { credits: number; kind?: TransactionKind },
  tx?: Tx,
) {
  if (!positive(input.credits)) {
    return { ok: false as const, code: "invalid" as const, balance: 0 };
  }
  return run({ ...input, delta: -input.credits, kind: input.kind ?? "CREDIT_SPEND" }, tx);
}

export async function creditCredits(
  input: Omit<LedgerWrite, "delta" | "kind"> & { credits: number; kind: TransactionKind },
  tx?: Tx,
) {
  if (!positive(input.credits)) {
    return { ok: false as const, code: "invalid" as const, balance: 0 };
  }
  return run({ ...input, delta: input.credits, kind: input.kind }, tx);
}

export async function refundCredits(
  input: Omit<LedgerWrite, "delta" | "kind"> & { credits: number; externalRef: string },
  tx?: Tx,
) {
  if (!positive(input.credits)) {
    return { ok: false as const, code: "invalid" as const, balance: 0 };
  }
  return run({ ...input, delta: input.credits, kind: "CREDIT_REFUND" }, tx);
}

export async function readCreditBalance(userId: string, prisma: PrismaClient = getPrisma()) {
  const [user, wallet] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { credits: true } }),
    prisma.creditWallet.findUnique({ where: { userId }, select: { balance: true } }),
  ]);
  if (!user) return 0;
  return canonicalBalance(user.credits, wallet?.balance ?? null);
}
