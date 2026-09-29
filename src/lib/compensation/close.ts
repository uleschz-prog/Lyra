import { monthKey, nextMonthStart } from "@/lib/compensation/activity";
import { monthlyClose, roundMoney } from "@/lib/compensation/engine";
import { memberSelect, toMembers } from "@/lib/compensation/members";
import { getPrisma } from "@/lib/prisma";

const closeTag = (key: string) => `cierre ${key}`;

export async function closeMonth(month: Date) {
  const prisma = getPrisma();
  const key = monthKey(month);
  const to = nextMonthStart(month);

  const already = await prisma.transaction.count({
    where: { kind: "COMMISSION", description: { endsWith: closeTag(key) } },
  });
  if (already > 0) {
    return { ok: false as const, error: `El mes ${key} ya está cerrado.` };
  }

  const users = await prisma.user.findMany({
    where: { createdAt: { lt: to } },
    select: memberSelect(month),
  });
  const members = toMembers(users, month);

  const { payouts, points, pool } = monthlyClose(members);
  let paid = 0;

  await prisma.$transaction(async (tx) => {
    for (const payout of payouts) {
      const wallet = await tx.creditWallet.upsert({
        where: { userId: payout.userId },
        create: { userId: payout.userId, balance: 0, totalEarnedCommissions: 0 },
        update: {},
      });
      const rows = [
        payout.rankPayout > 0
          ? { amount: payout.rankPayout, description: `Bono Constelación · rango ${payout.rankLabel} · ${closeTag(key)}` }
          : null,
        payout.poolPayout > 0 ? { amount: payout.poolPayout, description: `Fondo Galaxia · ${closeTag(key)}` } : null,
      ].filter((row) => row !== null);

      for (const row of rows) {
        await tx.creditWallet.update({
          where: { id: wallet.id },
          data: { totalEarnedCommissions: { increment: row.amount } },
        });
        await tx.user.update({ where: { id: payout.userId }, data: { walletBalance: { increment: row.amount } } });
        await tx.transaction.create({
          data: {
            userId: payout.userId,
            walletId: wallet.id,
            amount: row.amount,
            creditDelta: 0,
            kind: "COMMISSION",
            description: row.description,
          },
        });
        paid += row.amount;
      }
    }
  });

  return {
    ok: true as const,
    month: key,
    members: members.length,
    active: members.filter((member) => member.status === "ACTIVE").length,
    points,
    pool,
    paid: roundMoney(paid),
    payouts: payouts.length,
  };
}
