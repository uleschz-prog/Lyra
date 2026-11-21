import { composioConfigured } from "@/lib/ai/composio";
import { userConnections } from "@/lib/ai/composio-user";
import { monthStart } from "@/lib/compensation/activity";
import { roundMoney } from "@/lib/compensation/engine";
import {
  buildDailyTrend,
  buildHomeSteps,
  startOfTrendWindow,
  type HomeStep,
  type TrendPoint,
} from "@/lib/dashboard/home-logic";
import { listTemplates, type TemplateCard } from "@/lib/marketplace/core";
import { getPrisma } from "@/lib/prisma";
import { isProjectKind } from "@/lib/projects/store";
import type { ProjectKind } from "@/lib/vega/build-project";
import type { AuthProfile } from "@/lib/types";
import { canUseVega } from "@/lib/vega/access";
import { previewText } from "@/lib/vega/home";

export type { HomeStep, TrendPoint };

export type HomeAgent = {
  id: string;
  name: string;
  specialty: string;
  avatar: string;
  isDefault: boolean;
  preview: string | null;
};

export type HomeProject = {
  id: string;
  kind: ProjectKind;
  title: string;
  summary: string;
  updatedAt: string;
  publishStatus: string | null;
  slug: string | null;
};

export type HomeTemplate = Pick<TemplateCard, "id" | "slug" | "kind" | "title" | "summary" | "price" | "official" | "usesCount">;

export type HomeSummary = {
  commissionsMonth: number;
  commissionsTotal: number;
  directs: number;
  joinedThisMonth: number;
  activeDirects: number;
  commissionsTrend: TrendPoint[];
  creditsTrend: TrendPoint[];
  canUseVega: boolean;
  connectedApps: number;
  showConnections: boolean;
  agents: HomeAgent[];
  projects: HomeProject[];
  templates: HomeTemplate[];
  steps: HomeStep[];
};

async function safe<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

async function connectedAppCount(userId: string) {
  if (!composioConfigured()) return 0;
  const connections = await safe(userConnections(userId), null);
  if (!connections) return 0;
  return Object.values(connections).filter(Boolean).length;
}

export async function homeSummary(user: AuthProfile): Promise<HomeSummary> {
  const prisma = getPrisma();
  const month = monthStart();
  const vega = canUseVega(user);
  const showConnections = vega && composioConfigured();
  const trendSince = startOfTrendWindow();

  const [monthAgg, totalAgg, directs, joined, trendRows, agentRows, projectRows, projectCount, publishedCount, templates, talkedToVega, connectedApps] = await Promise.all([
    safe(prisma.transaction.aggregate({ where: { userId: user.id, kind: "COMMISSION", createdAt: { gte: month } }, _sum: { amount: true } }), null),
    safe(prisma.transaction.aggregate({ where: { userId: user.id, kind: "COMMISSION" }, _sum: { amount: true } }), null),
    safe(prisma.user.count({ where: { sponsorId: user.id } }), 0),
    safe(prisma.user.count({ where: { sponsorId: user.id, createdAt: { gte: month } } }), 0),
    safe(
      prisma.transaction.findMany({
        where: { userId: user.id, createdAt: { gte: trendSince } },
        select: { kind: true, amount: true, creditDelta: true, createdAt: true },
      }),
      [],
    ),
    vega
      ? safe(
          prisma.vegaAgent.findMany({
            where: { userId: user.id },
            orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
            take: 6,
            select: { id: true, name: true, specialty: true, avatar: true, isDefault: true },
          }),
          [],
        )
      : Promise.resolve([]),
    safe(
      prisma.project.findMany({
        where: { userId: user.id, deletedAt: null, versionCount: { gt: 0 } },
        orderBy: { updatedAt: "desc" },
        take: 4,
        select: {
          id: true,
          kind: true,
          title: true,
          summary: true,
          updatedAt: true,
          publish: { select: { status: true, slug: true } },
        },
      }),
      [],
    ),
    safe(prisma.project.count({ where: { userId: user.id, deletedAt: null, versionCount: { gt: 0 } } }), 0),
    safe(prisma.project.count({ where: { userId: user.id, deletedAt: null, versionCount: { gt: 0 }, publish: { status: "published" } } }), 0),
    safe(listTemplates(prisma, {}, 4), []),
    vega
      ? safe(prisma.vegaMessage.count({ where: { role: "user", conversation: { userId: user.id } } }), 0)
      : Promise.resolve(0),
    showConnections ? connectedAppCount(user.id) : Promise.resolve(0),
  ]);

  const previews = await Promise.all(
    agentRows.map((agent) =>
      safe(
        prisma.vegaMessage.findFirst({
          where: { conversation: { userId: user.id, agentId: agent.id } },
          orderBy: { createdAt: "desc" },
          select: { content: true, role: true },
        }),
        null,
      ),
    ),
  );

  const agents: HomeAgent[] = agentRows.map((agent, index) => {
    const last = previews[index];
    const text = previewText(last?.content);
    return {
      ...agent,
      preview: text ? (last?.role === "user" ? `Tú: ${text}` : text) : null,
    };
  });

  const projects: HomeProject[] = projectRows.flatMap((row) =>
    isProjectKind(row.kind)
      ? [
          {
            id: row.id,
            kind: row.kind,
            title: row.title,
            summary: row.summary,
            updatedAt: row.updatedAt.toISOString(),
            publishStatus: row.publish?.status ?? null,
            slug: row.publish?.slug ?? null,
          },
        ]
      : [],
  );

  return {
    commissionsMonth: roundMoney(Number(monthAgg?._sum.amount ?? 0)),
    commissionsTotal: roundMoney(Math.max(Number(totalAgg?._sum.amount ?? 0), user.walletBalance)),
    directs,
    joinedThisMonth: joined,
    activeDirects: user.activeDirects,
    commissionsTrend: buildDailyTrend(trendRows, "commissions"),
    creditsTrend: buildDailyTrend(trendRows, "credits"),
    canUseVega: vega,
    connectedApps,
    showConnections,
    agents,
    projects,
    templates: templates.map((item) => ({
      id: item.id,
      slug: item.slug,
      kind: item.kind,
      title: item.title,
      summary: item.summary,
      price: item.price,
      official: item.official,
      usesCount: item.usesCount,
    })),
    steps: buildHomeSteps({
      canUseVega: vega,
      talkedToVega: talkedToVega > 0,
      projectCount,
      publishedCount,
      customAgentCount: agents.filter((agent) => !agent.isDefault).length,
      connectedApps,
      showConnections,
      directs,
    }),
  };
}
