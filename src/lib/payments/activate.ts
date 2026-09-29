import type { Prisma } from "@prisma/client";

import { getPackage, type SignupPlanId } from "@/config/compensation-plan";
import { payCommissions } from "@/lib/compensation/payout";

export async function activateMembership(
  tx: Prisma.TransactionClient,
  user: { id: string; name: string; sponsorId: string | null },
  packageId: SignupPlanId,
  record: { description: string; externalRef?: string },
) {
  const plan = getPackage(packageId);
  const claimed = await tx.user.updateMany({
    where: { id: user.id, pendingPackage: packageId },
    data: {
      package: packageId,
      pendingPackage: null,
      credits: { increment: plan.credits },
      activationCredits: "activationCredits" in plan ? plan.activationCredits : 0,
      createdAt: new Date(),
    },
  });
  if (claimed.count === 0) return false;

  const wallet = await tx.creditWallet.upsert({
    where: { userId: user.id },
    create: { userId: user.id, balance: plan.credits },
    update: { balance: { increment: plan.credits } },
  });
  await tx.transaction.create({
    data: {
      userId: user.id,
      walletId: wallet.id,
      amount: plan.price,
      creditDelta: plan.credits,
      kind: "CREDIT_PURCHASE",
      description: record.description,
      externalRef: record.externalRef,
    },
  });
  await payCommissions(tx, { ...user, package: packageId }, plan.price, "purchase");
  return true;
}
