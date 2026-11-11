import type { Prisma } from "@prisma/client";

import { getPackage, toPackageType, type SignupPlanId } from "@/config/compensation-plan";
import { payCommissions } from "@/lib/compensation/payout";
import { creditCredits } from "@/lib/credits/ledger";

export async function activateMembership(
  tx: Prisma.TransactionClient,
  user: { id: string; name: string; sponsorId: string | null },
  packageId: SignupPlanId,
  record: { description: string; externalRef?: string; skipCommissions?: boolean },
) {
  const plan = getPackage(packageId);
  const claimed = await tx.user.updateMany({
    where: { id: user.id, pendingPackage: toPackageType(packageId) },
    data: {
      package: toPackageType(packageId),
      pendingPackage: null,
      activationCredits: typeof plan.activationCredits === "number" ? plan.activationCredits : 0,
      createdAt: new Date(),
    },
  });
  if (claimed.count === 0) return false;

  if (plan.credits > 0) {
    const credited = await creditCredits(
      {
        userId: user.id,
        credits: plan.credits,
        amountUsd: plan.price,
        externalRef: record.externalRef,
        kind: "CREDIT_PURCHASE",
        reason: "membership.activate",
        description: record.description,
      },
      tx,
    );
    if (!credited.ok) {
      throw new Error("No se pudieron acreditar los créditos de la membresía.");
    }
  } else {
    // Planes sin créditos de alta (p. ej. Corporate ya no ofrecido): se deja
    // constancia con delta 0 y el mismo externalRef para la idempotencia del pago.
    const wallet = await tx.creditWallet.upsert({
      where: { userId: user.id },
      create: { userId: user.id, balance: 0 },
      update: {},
    });
    await tx.transaction.create({
      data: {
        userId: user.id,
        walletId: wallet.id,
        amount: plan.price,
        creditDelta: 0,
        kind: "CREDIT_PURCHASE",
        description: record.description,
        reason: "membership.activate",
        externalRef: record.externalRef,
      },
    });
  }

  if (!record.skipCommissions) {
    await payCommissions(tx, { ...user, package: packageId }, plan.price, "purchase");
  }
  return true;
}
