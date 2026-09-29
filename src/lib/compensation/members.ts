import type { Prisma } from "@prisma/client";

import { compensationPlan, getPackage, isPackageId, type PackageId } from "@/config/compensation-plan";
import { monthStart, nextMonthStart, paysOwnWay } from "@/lib/compensation/activity";
import { roundMoney, type CompensationMember } from "@/lib/compensation/engine";
import { getPrisma } from "@/lib/prisma";
import type { NetworkNode, Rank } from "@/lib/types";

export const memberSelect = (month: Date) =>
  ({
    id: true,
    name: true,
    email: true,
    rank: true,
    sponsorId: true,
    package: true,
    createdAt: true,
    isSubscriptionExempt: true,
    activatedWithCode: true,
    transactions: {
      where: { kind: "REBUY", createdAt: { gte: monthStart(month), lt: nextMonthStart(month) } },
      select: { amount: true },
    },
  }) satisfies Prisma.UserSelect;

export type MemberRow = Prisma.UserGetPayload<{ select: ReturnType<typeof memberSelect> }>;

export function personalVolume(user: MemberRow, month: Date) {
  const joined = user.createdAt >= monthStart(month) && user.createdAt < nextMonthStart(month);
  const entry = joined && !user.activatedWithCode && isPackageId(user.package) ? getPackage(user.package).price : 0;
  const rebuys = user.transactions.reduce((total, row) => total + Number(row.amount), 0);
  return roundMoney(entry + rebuys);
}

export function toMembers(users: MemberRow[], month: Date): CompensationMember[] {
  const base = new Map(
    users.map((user) => [
      user.id,
      paysOwnWay(
        {
          package: user.package,
          createdAt: user.createdAt,
          isSubscriptionExempt: user.isSubscriptionExempt,
          paidRebuy: user.transactions.length > 0,
        },
        month,
      ),
    ]),
  );
  const activeDirects = new Map<string, number>();
  for (const user of users) {
    if (user.sponsorId && base.get(user.id)) {
      activeDirects.set(user.sponsorId, (activeDirects.get(user.sponsorId) ?? 0) + 1);
    }
  }

  return users.map((user) => {
    const active =
      base.get(user.id) ||
      (activeDirects.get(user.id) ?? 0) >= compensationPlan.minActiveDirectsForFreeSubscription;
    return {
      id: user.id,
      name: user.name,
      sponsorId: user.sponsorId,
      status: active ? "ACTIVE" : "INACTIVE",
      packageId: user.package === "NONE" ? null : (user.package as PackageId),
      personalVolume: personalVolume(user, month),
    };
  });
}

export async function loadNetwork(rootId: string, month = new Date()) {
  const prisma = getPrisma();
  const links = await prisma.networkRelation.findMany({
    where: { ancestorId: rootId },
    select: { userId: true, depth: true },
  });
  const depth = new Map<string, number>([[rootId, 0], ...links.map((link) => [link.userId, link.depth] as const)]);
  const users = await prisma.user.findMany({
    where: { id: { in: [...depth.keys()] } },
    select: memberSelect(month),
  });
  return { users, depth, members: toMembers(users, month) };
}

export function networkTree(rootId: string, users: MemberRow[], depth: Map<string, number>, month = new Date()) {
  const byId = new Map(users.map((user) => [user.id, user]));
  const children = new Map<string, MemberRow[]>();
  for (const user of users) {
    if (user.id === rootId || !user.sponsorId) continue;
    children.set(user.sponsorId, [...(children.get(user.sponsorId) ?? []), user]);
  }

  const build = (user: MemberRow): NetworkNode => ({
    id: user.id,
    name: user.name,
    email: user.email,
    rank: user.rank as Rank,
    depth: depth.get(user.id) ?? 0,
    personalVolume: personalVolume(user, month),
    sponsorName: user.sponsorId ? (byId.get(user.sponsorId)?.name ?? "LYRA") : "LYRA",
    children: (children.get(user.id) ?? [])
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(build),
  });

  const root = byId.get(rootId);
  return root ? build(root) : null;
}
