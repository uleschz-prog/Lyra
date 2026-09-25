import { rebuyStatus } from "@/config/compensation-plan";
import { canonicalBalance } from "@/lib/credits/ledger-logic";
import { readSession } from "@/lib/auth/session";
import { isSuspended } from "@/lib/auth/suspension";
import { activitySelect, paysOwnWay, rebuyPaidFilter, toActivity } from "@/lib/compensation/activity";
import { getPrisma } from "@/lib/prisma";
import type { AuthProfile, WalletTransaction } from "@/lib/types";

const profileSelect = {
  id: true,
  name: true,
  email: true,
  username: true,
  role: true,
  package: true,
  pendingPackage: true,
  rank: true,
  sponsorId: true,
  referralCode: true,
  credits: true,
  walletBalance: true,
  isSubscriptionExempt: true,
  activationCredits: true,
  alphaFastTrackUntil: true,
  avatar: true,
} as const;

export async function getCurrentUser(): Promise<AuthProfile | null> {
  if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) return null;

  try {
    const userId = await readSession();
    if (!userId) return null;

    const prisma = getPrisma();
    const found = await prisma.user.findUnique({
      where: { id: userId },
      select: { ...profileSelect, suspendedUntil: true },
    });
    if (!found || isSuspended(found.suspendedUntil)) return null;
    const user = { ...found, suspendedUntil: undefined };

    const now = new Date();
    const [directs, rebuysThisMonth, wallet] = await Promise.all([
      prisma.user.findMany({
        where: { sponsorId: user.id, package: { not: "NONE" } },
        select: activitySelect(now),
      }),
      prisma.transaction.count({ where: { userId: user.id, ...rebuyPaidFilter(now) } }),
      prisma.creditWallet.findUnique({ where: { userId: user.id }, select: { balance: true } }),
    ]);
    const activeDirects = directs.filter((direct) => paysOwnWay(toActivity(direct), now)).length;

    return {
      ...user,
      credits: canonicalBalance(user.credits, wallet?.balance ?? null),
      walletBalance: user.walletBalance,
      alphaFastTrackUntil: user.alphaFastTrackUntil?.toISOString() ?? null,
      activeDirects,
      rebuyPaidThisMonth: rebuysThisMonth > 0,
      fastTrack:
        user.package === "POLARIS" &&
        user.alphaFastTrackUntil !== null &&
        user.alphaFastTrackUntil.getTime() > Date.now(),
      isSubscriptionExempt: user.isSubscriptionExempt || rebuyStatus(user.package, activeDirects).exempt,
    };
  } catch {
    return null;
  }
}

export async function getRecentTransactions(userId: string): Promise<WalletTransaction[]> {
  if (!process.env.DATABASE_URL) return [];

  try {
    const prisma = getPrisma();
    const rows = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 12,
    });

    return rows.map((row) => ({
      id: row.id,
      description: row.description,
      amountUsd: Number(row.amount),
      creditDelta: row.creditDelta,
      kind: row.kind,
      createdAt: row.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}
