import { masterPrompt } from "@/config/constellation";

import { BudgetExceededError } from "../llm-gateway/errors";
import type { SentimentLabel } from "../sentiment/classify";
import { escapeHtml, printableDocument } from "./html";

export type ReportPost = {
  author: string;
  text: string;
  hashtags: string[];
  postedAt: Date;
  sentiment: SentimentLabel;
};

export type CompetitorSlice = {
  username: string;
  postCount: number;
  coverage: "ready" | "pending_ingest";
  sentiment: { positive: number; negative: number; neutral: number };
  hashtags: string[];
  weeklyStrategy: string;
};

export type CompetitorReport = {
  status: "ready" | "pending";
  generatedAt: string;
  period: { start: string; end: string };
  competitors: CompetitorSlice[];
  comparison: string;
  generatedBy: "heuristic" | "llm";
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function buildCompetitorReport(input: {
  usernames: string[];
  posts: ReportPost[];
  now: Date;
  narratives?: { strategies: Record<string, string>; comparison: string } | null;
}): CompetitorReport {
  const start = new Date(input.now.getTime() - WEEK_MS);
  const competitors = input.usernames.map((username) => {
    const own = input.posts.filter((post) => post.author.toLowerCase() === username && post.postedAt >= start && post.postedAt <= input.now);
    const sentiment = { positive: 0, negative: 0, neutral: 0 };
    const tags = new Map<string, number>();
    for (const post of own) {
      sentiment[post.sentiment] += 1;
      for (const tag of post.hashtags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
    }
    const hashtags = [...tags.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);
    const strategy = input.narratives?.strategies[username]?.trim();
    return {
      username,
      postCount: own.length,
      coverage: own.length > 0 ? ("ready" as const) : ("pending_ingest" as const),
      sentiment,
      hashtags,
      weeklyStrategy: strategy || heuristicStrategy(username, own.length, sentiment, hashtags),
    };
  });
  const ready = competitors.some((item) => item.coverage === "ready");
  return {
    status: ready ? "ready" : "pending",
    generatedAt: input.now.toISOString(),
    period: { start: start.toISOString(), end: input.now.toISOString() },
    competitors,
    comparison: input.narratives?.comparison?.trim() || heuristicComparison(competitors),
    generatedBy: input.narratives ? "llm" : "heuristic",
  };
}

export function buildCompetitorPrompt(report: CompetitorReport): string {
  const brief = report.competitors.map((item) => ({
    username: item.username,
    postCount: item.postCount,
    sentiment: item.sentiment,
    hashtags: item.hashtags,
  }));
  return `${masterPrompt}

Resume la semana de estos competidores en JSON, en español, sin prometer ingresos ni resultados.
{"strategies":{"usuario":"un párrafo"},"comparison":"un párrafo"}
Datos: ${JSON.stringify(brief)}`;
}

export function parseNarrative(text: string): { strategies: Record<string, string>; comparison: string } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1)) as { strategies?: unknown; comparison?: unknown };
    if (!value.strategies || typeof value.strategies !== "object" || typeof value.comparison !== "string") return null;
    const strategies: Record<string, string> = {};
    for (const [key, item] of Object.entries(value.strategies)) {
      if (typeof item === "string" && item.trim()) strategies[key.toLowerCase()] = item.trim();
    }
    return { strategies, comparison: value.comparison.trim() };
  } catch {
    return null;
  }
}

export async function composeCompetitorAnalysis(input: {
  usernames: string[];
  posts: ReportPost[];
  now: Date;
  summarize: (prompt: string) => Promise<string>;
}): Promise<{ report: CompetitorReport; llmCalled: boolean; llmBudgetExceeded: boolean }> {
  const heuristic = buildCompetitorReport(input);
  if (heuristic.status === "pending") return { report: heuristic, llmCalled: false, llmBudgetExceeded: false };
  try {
    const text = await input.summarize(buildCompetitorPrompt(heuristic));
    const narratives = parseNarrative(text);
    if (!narratives) return { report: heuristic, llmCalled: true, llmBudgetExceeded: false };
    return {
      report: buildCompetitorReport({ ...input, narratives }),
      llmCalled: true,
      llmBudgetExceeded: false,
    };
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      return { report: heuristic, llmCalled: true, llmBudgetExceeded: true };
    }
    throw error;
  }
}

export function renderCompetitorHtml(report: CompetitorReport): string {
  const rows = report.competitors
    .map(
      (item) =>
        `<section><h2>@${escapeHtml(item.username)}</h2><p>${escapeHtml(item.weeklyStrategy)}</p><p>Posts: ${item.postCount}. Positivos ${item.sentiment.positive}, negativos ${item.sentiment.negative}, neutros ${item.sentiment.neutral}.</p></section>`,
    )
    .join("");
  return printableDocument("Comparativo de competidores", `${rows}<h2>Comparación</h2><p>${escapeHtml(report.comparison)}</p>`);
}

function heuristicStrategy(username: string, count: number, sentiment: CompetitorSlice["sentiment"], hashtags: string[]): string {
  if (count === 0) return "Sin posts en la ingesta compartida para este periodo.";
  const dominant = dominantLabel(sentiment);
  const tags = hashtags.length > 0 ? ` Hashtags: ${hashtags.join(", ")}.` : "";
  return `${username} publicó ${count} posts. El tono dominante fue ${dominant}.${tags}`;
}

function heuristicComparison(competitors: CompetitorSlice[]): string {
  if (competitors.every((item) => item.coverage === "pending_ingest")) {
    return "Todavía no hay posts ingeridos. La siguiente corrida compartida los va a buscar.";
  }
  return competitors.map((item) => `@${item.username}: ${item.postCount} posts`).join(". ");
}

function dominantLabel(sentiment: CompetitorSlice["sentiment"]): string {
  const pairs: Array<[string, number]> = [
    ["positivo", sentiment.positive],
    ["negativo", sentiment.negative],
    ["neutro", sentiment.neutral],
  ];
  return [...pairs].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "neutro";
}
