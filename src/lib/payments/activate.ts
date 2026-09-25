import type { Prisma } from "@prisma/client";

import { getPackage, type SignupPlanId } from "@/config/compensation-plan";
import { payCommissions } from "@/lib/compensation/payout";
import { creditCredits } from "@/lib/credits/ledger";

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
      activationCredits: "activationCredits" in plan ? plan.activationCredits : 0,
      createdAt: new Date(),
    },
  });
  if (claimed.count === 0) return false;

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
  if (!credited.ok) throw new Error("No se pudieron acreditar los créditos de la membresía.");
  if (!credited.already) {
    await payCommissions(tx, { ...user, package: packageId }, plan.price, "purchase");
  }
  return true;
}
