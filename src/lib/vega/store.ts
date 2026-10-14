import { Prisma, type VegaSentiment } from "@prisma/client";

import { monthlyLlmBudgetUsd, readBudgetRatio } from "@/lib/vega/budget-policy";
import { ListeningLimitError } from "@/lib/vega/input";
import { getPrisma } from "@/lib/prisma";
import type { SentimentLabel } from "@/lib/vega/sentiment/classify";
import type { FanMatch, Listener, StoredPost } from "@/lib/vega/x/ingest";

const toSentiment = {
  positive: "POSITIVE",
  negative: "NEGATIVE",
  neutral: "NEUTRAL",
} as const satisfies Record<SentimentLabel, VegaSentiment>;

const fromSentiment: Record<VegaSentiment, SentimentLabel> = {
  POSITIVE: "positive",
  NEGATIVE: "negative",
  NEUTRAL: "neutral",
};

const listeningCap = 20;

export async function ensureProfile(userId: string) {
  return getPrisma().vegaProfile.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { id: true, userId: true, budgetRatioOverride: true },
  });
}

export async function readUserBudgetUsd(userId: string, packageId: string): Promise<number> {
  const profile = await getPrisma().vegaProfile.findUnique({
    where: { userId },
    select: { budgetRatioOverride: true },
  });
  return monthlyLlmBudgetUsd(packageId, readBudgetRatio(process.env.LLM_BUDGET_RATIO), profile?.budgetRatioOverride ?? null);
}

export async function addListening(userId: string, input: { keywords: string[]; competitors: string[] }) {
  const profile = await ensureProfile(userId);
  const prisma = getPrisma();
  const [keywords, competitors] = await Promise.all([
    prisma.vegaKeyword.findMany({ where: { profileId: profile.id }, select: { value: true } }),
    prisma.vegaCompetitor.findMany({ where: { profileId: profile.id }, select: { username: true } }),
  ]);
  const keywordSet = new Set(keywords.map((item) => item.value));
  const competitorSet = new Set(competitors.map((item) => item.username));
  const nextKeywords = input.keywords.filter((item) => !keywordSet.has(item));
  const nextCompetitors = input.competitors.filter((item) => !competitorSet.has(item));
  if (keywordSet.size + nextKeywords.length > listeningCap || competitorSet.size + nextCompetitors.length > listeningCap) {
    throw new ListeningLimitError();
  }
  await prisma.$transaction([
    prisma.vegaKeyword.createMany({ data: nextKeywords.map((value) => ({ profileId: profile.id, value })) }),
    prisma.vegaCompetitor.createMany({ data: nextCompetitors.map((username) => ({ profileId: profile.id, username })) }),
  ]);
  return {
    profileId: profile.id,
    keywords: [...keywordSet, ...nextKeywords],
    competitors: [...competitorSet, ...nextCompetitors],
  };
}

export async function readListening(userId: string) {
  const profile = await getPrisma().vegaProfile.findUnique({
    where: { userId },
    select: {
      keywords: { select: { value: true }, orderBy: { createdAt: "asc" } },
      competitors: { select: { username: true }, orderBy: { createdAt: "asc" } },
      schedules: { select: { cadence: true, enabled: true, lastSentAt: true } },
    },
  });
  return {
    keywords: profile?.keywords.map((item) => item.value) ?? [],
    competitors: profile?.competitors.map((item) => item.username) ?? [],
    schedules: profile?.schedules ?? [],
  };
}

export async function setSchedule(userId: string, cadence: "DAILY" | "WEEKLY", enabled: boolean) {
  const profile = await ensureProfile(userId);
  return getPrisma().vegaReportSchedule.upsert({
    where: { profileId_cadence: { profileId: profile.id, cadence } },
    create: { profileId: profile.id, cadence, enabled },
    update: { enabled },
    select: { cadence: true, enabled: true, lastSentAt: true },
  });
}

export async function listListeners(): Promise<Listener[]> {
  const profiles = await getPrisma().vegaProfile.findMany({
    where: { user: { package: { in: ["FOUNDER", "CORPORATE"] } } },
    select: {
      id: true,
      userId: true,
      user: { select: { package: true } },
      keywords: { select: { value: true } },
      competitors: { select: { username: true } },
    },
  });
  return profiles
    .filter((profile) => profile.keywords.length > 0 || profile.competitors.length > 0)
    .map((profile) => ({
      profileId: profile.id,
      userId: profile.userId,
      packageId: profile.user.package,
      keywords: profile.keywords.map((item) => item.value),
      competitors: profile.competitors.map((item) => item.username),
    }));
}

export async function existingExternalIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await getPrisma().vegaIngestPost.findMany({
    where: { externalId: { in: ids } },
    select: { externalId: true },
  });
  return new Set(rows.map((row) => row.externalId));
}

export async function saveIngest(posts: StoredPost[], matches: FanMatch[]) {
  if (posts.length === 0) return;
  const prisma = getPrisma();
  await prisma.vegaIngestPost.createMany({
    data: posts.map((post) => ({
      externalId: post.externalId,
      author: post.author,
      text: post.text,
      hashtags: post.hashtags,
      postedAt: post.postedAt,
      sentiment: toSentiment[post.sentiment],
      score: post.score,
    })),
    skipDuplicates: true,
  });
  const saved = await prisma.vegaIngestPost.findMany({
    where: { externalId: { in: posts.map((post) => post.externalId) } },
    select: { id: true, externalId: true },
  });
  const ids = new Map(saved.map((row) => [row.externalId, row.id]));
  const rows = new Map<string, { postId: string; profileId: string; keywords: string[]; competitors: string[] }>();
  for (const match of matches) {
    const postId = ids.get(match.externalId);
    if (!postId) continue;
    const key = `${postId}:${match.profileId}`;
    const current = rows.get(key);
    if (!current) {
      rows.set(key, { postId, profileId: match.profileId, keywords: [...match.keywords], competitors: [...match.competitors] });
      continue;
    }
    current.keywords = [...new Set([...current.keywords, ...match.keywords])];
    current.competitors = [...new Set([...current.competitors, ...match.competitors])];
  }
  if (rows.size === 0) return;
  await prisma.vegaPostMatch.createMany({ data: [...rows.values()], skipDuplicates: true });
}

export async function recentSentiments(profileId: string, keyword: string, since: Date) {
  const rows = await getPrisma().vegaPostMatch.findMany({
    where: { profileId, keywords: { has: keyword }, post: { postedAt: { gte: since } } },
    select: { post: { select: { text: true, postedAt: true, sentiment: true } } },
    take: 100,
  });
  return rows.map((row) => ({
    text: row.post.text,
    createdAt: row.post.postedAt,
    sentiment: fromSentiment[row.post.sentiment],
  }));
}

export async function hasOpenAlert(profileId: string, keyword: string, since: Date) {
  const found = await getPrisma().vegaAlert.findFirst({
    where: { profileId, keyword, status: "OPEN", createdAt: { gte: since } },
    select: { id: true },
  });
  return Boolean(found);
}

export async function createAlert(alert: {
  profileId: string;
  keyword: string;
  windowStart: Date;
  windowEnd: Date;
  negativity: number;
  threshold: number;
  sampleSize: number;
}) {
  const created = await getPrisma().vegaAlert.create({ data: alert, select: { id: true } });
  return created.id;
}

export async function setAlertSummary(id: string, summary: string) {
  await getPrisma().vegaAlert.update({ where: { id }, data: { summary } });
}

export async function postsByAuthors(usernames: string[], since: Date) {
  const rows = await getPrisma().vegaIngestPost.findMany({
    where: { author: { in: usernames }, postedAt: { gte: since } },
    orderBy: { postedAt: "desc" },
    take: 200,
  });
  return rows.map(toReportPost);
}

export async function postsForProfile(profileId: string, since: Date) {
  const rows = await getPrisma().vegaPostMatch.findMany({
    where: { profileId, post: { postedAt: { gte: since } } },
    include: { post: true },
    orderBy: { post: { postedAt: "desc" } },
    take: 400,
  });
  return rows.map((row) => toReportPost(row.post));
}

export async function alertsForProfile(profileId: string, since: Date) {
  const rows = await getPrisma().vegaAlert.findMany({
    where: { profileId, createdAt: { gte: since } },
    select: { keyword: true, negativity: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return rows;
}

export async function searchUserPosts(profileId: string, query: string) {
  const needle = query.trim().slice(0, 80);
  const rows = await getPrisma().vegaPostMatch.findMany({
    where: needle
      ? { profileId, post: { text: { contains: needle, mode: "insensitive" } } }
      : { profileId },
    include: { post: true },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  return rows.map((row) => ({ author: row.post.author, text: row.post.text.slice(0, 240) }));
}

export async function saveReport(input: {
  profileId: string;
  kind: string;
  title: string;
  payload: unknown;
  html: string;
  periodStart?: Date;
  periodEnd?: Date;
}) {
  await getPrisma().vegaSavedReport.create({
    data: {
      profileId: input.profileId,
      kind: input.kind,
      title: input.title,
      payload: JSON.parse(JSON.stringify(input.payload)) as Prisma.InputJsonValue,
      html: input.html,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    },
  });
}

export async function listSchedules() {
  const rows = await getPrisma().vegaReportSchedule.findMany({
    where: { enabled: true },
    include: { profile: { include: { user: { select: { id: true, email: true, package: true } } } } },
  });
  return rows.map((row) => ({
    id: row.id,
    profileId: row.profileId,
    userId: row.profile.user.id,
    packageId: row.profile.user.package,
    email: row.profile.user.email,
    cadence: row.cadence,
    enabled: row.enabled,
    lastSentAt: row.lastSentAt,
  }));
}

export async function markScheduleSent(id: string, lastSentAt: Date) {
  await getPrisma().vegaReportSchedule.update({ where: { id }, data: { lastSentAt } });
}

function toReportPost(post: { author: string; text: string; hashtags: string[]; postedAt: Date; sentiment: VegaSentiment }) {
  return {
    author: post.author,
    text: post.text,
    hashtags: post.hashtags,
    postedAt: post.postedAt,
    sentiment: fromSentiment[post.sentiment],
  };
}
