import type { Prisma } from "@prisma/client";

import { compensationPlan, type PackageId } from "@/config/compensation-plan";
import { activitySelect, paysOwnWay, toActivity } from "@/lib/compensation/activity";
import { bonusLabels, distributeSale, roundMoney, type CompensationMember } from "@/lib/compensation/engine";

type Tx = Prisma.TransactionClient;

async function isActive(tx: Tx, userId: string, now: Date) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: activitySelect(now) });
  if (!user) return false;
  if (paysOwnWay(toActivity(user), now)) return true;
  const directs = await tx.user.findMany({
    where: { sponsorId: userId, package: { not: "NONE" } },
    select: activitySelect(now),
  });
  const active = directs.filter((direct) => paysOwnWay(toActivity(direct), now)).length;
  return active >= compensationPlan.minActiveDirectsForFreeSubscription;
}

export async function payCommissions(
  tx: Tx,
  buyer: { id: string; name: string; sponsorId: string | null; package: string },
  amountUsd: number,
  kind: "purchase" | "rebuy",
) {
  const now = new Date();
  const chain: CompensationMember[] = [];
  const seen = new Set<string>([buyer.id]);
  let cursor = buyer.sponsorId;

  while (cursor && chain.length <= compensationPlan.unilevel.length && !seen.has(cursor)) {
    seen.add(cursor);
    const ancestor = await tx.user.findUnique({
      where: { id: cursor },
      select: { id: true, name: true, sponsorId: true, package: true },
    });
    if (!ancestor) break;
    chain.push({
      id: ancestor.id,
      name: ancestor.name,
      sponsorId: ancestor.sponsorId,
      status: (await isActive(tx, ancestor.id, now)) ? "ACTIVE" : "INACTIVE",
      packageId: ancestor.package === "NONE" ? null : (ancestor.package as PackageId),
      personalVolume: 0,
    });
    cursor = ancestor.sponsorId;
  }

  const members: CompensationMember[] = [
    {
      id: buyer.id,
      name: buyer.name,
      sponsorId: buyer.sponsorId,
      status: "ACTIVE",
      packageId: buyer.package === "NONE" ? null : (buyer.package as PackageId),
      personalVolume: 0,
    },
    ...chain,
  ];

  const lines = distributeSale(members, buyer.id, amountUsd, kind);
  for (const line of lines) {
    if (!line.paid || line.amount <= 0) continue;
    await tx.user.update({
      where: { id: line.sponsorId },
      data: { walletBalance: { increment: line.amount } },
    });
    const wallet = await tx.creditWallet.upsert({
      where: { userId: line.sponsorId },
      create: { userId: line.sponsorId, balance: 0, totalEarnedCommissions: line.amount },
      update: { totalEarnedCommissions: { increment: line.amount } },
    });
    await tx.transaction.create({
      data: {
        userId: line.sponsorId,
        walletId: wallet.id,
        amount: roundMoney(line.amount),
        creditDelta: 0,
        kind: "COMMISSION",
        description: `${bonusLabels[line.bonus]}${line.bonus === "chispa" ? "" : ` nivel ${line.level}`} · ${buyer.name}`,
      },
    });
  }

  return lines;
}
