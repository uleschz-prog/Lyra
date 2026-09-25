import type { Prisma } from "@prisma/client";

export function monthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function nextMonthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

export function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthFromKey(key: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return new Date(Date.UTC(Number(match[1]), month - 1, 1));
}

export type ActivityInput = {
  package: string;
  createdAt: Date;
  isSubscriptionExempt: boolean;
  paidRebuy: boolean;
};

export function paysOwnWay(member: ActivityInput, month: Date) {
  if (member.package === "NONE") return false;
  if (member.package === "CORPORATE" || member.isSubscriptionExempt) return true;
  if (member.createdAt >= monthStart(month) && member.createdAt < nextMonthStart(month)) return true;
  return member.paidRebuy;
}

export function rebuyPaidFilter(month = new Date()): Prisma.TransactionWhereInput {
  return { kind: "REBUY", createdAt: { gte: monthStart(month), lt: nextMonthStart(month) } };
}

export const activitySelect = (month = new Date()) =>
  ({
    package: true,
    createdAt: true,
    isSubscriptionExempt: true,
    _count: { select: { transactions: { where: rebuyPaidFilter(month) } } },
  }) as const;

export function toActivity(row: {
  package: string;
  createdAt: Date;
  isSubscriptionExempt: boolean;
  _count: { transactions: number };
}): ActivityInput {
  return {
    package: row.package,
    createdAt: row.createdAt,
    isSubscriptionExempt: row.isSubscriptionExempt,
    paidRebuy: row._count.transactions > 0,
  };
}
