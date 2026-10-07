import { monthStart } from "@/lib/compensation/activity";
import { roundMoney } from "@/lib/compensation/engine";
import { getPrisma } from "@/lib/prisma";
import type { AuthProfile } from "@/lib/types";
import { canUseVega } from "@/lib/vega/access";

export type HomeActivity = {
  id: string;
  kind: "commission" | "credits" | "spend" | "rebuy" | "adjustment" | "referral";
  title: string;
  amount: number | null;
  credits: number | null;
  at: string;
};

export type HomeStep = {
  id: string;
  title: string;
  hint: string;
  href: string;
  done: boolean;
};

export type HomeSummary = {
  commissionsMonth: number;
  commissionsTotal: number;
  directs: number;
  joinedThisMonth: number;
  steps: HomeStep[];
  activity: HomeActivity[];
};

const kindMap = {
  COMMISSION: "commission",
  CREDIT_PURCHASE: "credits",
  CREDIT_SPEND: "spend",
  REBUY: "rebuy",
  ADJUSTMENT: "adjustment",
  PAYOUT: "spend",
  USDT_ORDER: "credits",
} as const;

async function safe<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

export async function homeSummary(user: AuthProfile): Promise<HomeSummary> {
  const prisma = getPrisma();
  const month = monthStart();
  const vega = canUseVega(user);

  const [monthAgg, totalAgg, directs, joined, transactions, recentReferrals, vegaChats] = await Promise.all([
    safe(prisma.transaction.aggregate({ where: { userId: user.id, kind: "COMMISSION", createdAt: { gte: month } }, _sum: { amount: true } }), null),
    safe(prisma.transaction.aggregate({ where: { userId: user.id, kind: "COMMISSION" }, _sum: { amount: true } }), null),
    safe(prisma.user.count({ where: { sponsorId: user.id } }), 0),
    safe(prisma.user.count({ where: { sponsorId: user.id, createdAt: { gte: month } } }), 0),
    safe(
      prisma.transaction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { id: true, kind: true, description: true, amount: true, creditDelta: true, createdAt: true },
      }),
      [],
    ),
    safe(
      prisma.user.findMany({
        where: { sponsorId: user.id },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { id: true, name: true, createdAt: true },
      }),
      [],
    ),
    vega ? safe(prisma.vegaConversation.count({ where: { userId: user.id } }), 0) : Promise.resolve(0),
  ]);

  const steps: HomeStep[] = [
    {
      id: "invite",
      title: "Invita a tu primer socio",
      hint: "Comparte tu enlace por WhatsApp o Telegram.",
      href: "#invitar",
      done: directs > 0,
    },
    ...(vega
      ? [{ id: "vega", title: "Habla con Vega", hint: "Tu super agente redacta, agenda y da seguimiento.", href: "/dashboard/super-agent", done: vegaChats > 0 }]
      : []),
  ];

  const activity: HomeActivity[] = [
    ...transactions.map((row) => ({
      id: row.id,
      kind: kindMap[row.kind],
      title: row.description,
      amount: Number(row.amount) || null,
      credits: row.creditDelta || null,
      at: row.createdAt.toISOString(),
    })),
    ...recentReferrals.map((row) => ({
      id: `ref-${row.id}`,
      kind: "referral" as const,
      title: `${row.name.split(" ")[0]} se unió a tu red`,
      amount: null,
      credits: null,
      at: row.createdAt.toISOString(),
    })),
  ]
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, 6);

  return {
    commissionsMonth: roundMoney(Number(monthAgg?._sum.amount ?? 0)),
    commissionsTotal: roundMoney(Math.max(Number(totalAgg?._sum.amount ?? 0), user.walletBalance)),
    directs,
    joinedThisMonth: joined,
    steps,
    activity,
  };
}
