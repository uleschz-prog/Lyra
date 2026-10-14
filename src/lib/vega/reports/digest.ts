import type { SentimentLabel } from "../sentiment/classify";
import { acceleratingHashtags, countHashtags } from "../trends/acceleration";
import { escapeHtml, printableDocument } from "./html";

export type DigestPost = {
  text: string;
  author: string;
  hashtags: string[];
  postedAt: Date;
  sentiment: SentimentLabel;
};

export type DigestPayload = {
  cadence: "DAILY" | "WEEKLY";
  period: { start: string; end: string };
  posts: number;
  sentiment: { positive: number; negative: number; neutral: number };
  alerts: Array<{ keyword: string; negativity: number }>;
  trends: Array<{ tag: string; recent: number; previous: number; acceleration: number }>;
  summary: string;
};

export function reportWindowMs(cadence: "DAILY" | "WEEKLY"): number {
  return cadence === "DAILY" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
}

export function buildDigest(input: {
  cadence: "DAILY" | "WEEKLY";
  now: Date;
  alerts: Array<{ keyword: string; negativity: number }>;
  posts: DigestPost[];
}): DigestPayload {
  const windowMs = reportWindowMs(input.cadence);
  const recentStart = input.now.getTime() - windowMs;
  const previousStart = recentStart - windowMs;
  const recentPosts = input.posts.filter((post) => post.postedAt.getTime() >= recentStart && post.postedAt.getTime() <= input.now.getTime());
  const previousPosts = input.posts.filter((post) => post.postedAt.getTime() >= previousStart && post.postedAt.getTime() < recentStart);
  const sentiment = { positive: 0, negative: 0, neutral: 0 };
  for (const post of recentPosts) sentiment[post.sentiment] += 1;
  const trends = acceleratingHashtags({
    recent: countHashtags(recentPosts.flatMap((post) => post.hashtags)),
    previous: countHashtags(previousPosts.flatMap((post) => post.hashtags)),
  });
  const summary = heuristicSummary(input.cadence, recentPosts.length, input.alerts.length, trends.map((item) => item.tag));
  return {
    cadence: input.cadence,
    period: { start: new Date(recentStart).toISOString(), end: input.now.toISOString() },
    posts: recentPosts.length,
    sentiment,
    alerts: input.alerts,
    trends,
    summary,
  };
}

export function renderDigestHtml(digest: DigestPayload, summary: string): string {
  const title = digest.cadence === "DAILY" ? "Reporte diario de Vega" : "Reporte semanal de Vega";
  const trends = digest.trends.map((item) => `<li>#${escapeHtml(item.tag)} ×${item.recent}</li>`).join("");
  const alerts = digest.alerts.map((item) => `<li>${escapeHtml(item.keyword)} · ${item.negativity.toFixed(2)}</li>`).join("");
  return printableDocument(
    title,
    `<p>${escapeHtml(summary)}</p><p>Posts en la ventana: ${digest.posts}.</p><h2>Alertas</h2><ul>${alerts || "<li>Sin alertas.</li>"}</ul><h2>Tendencias</h2><ul>${trends || "<li>Sin hashtags acelerando.</li>"}</ul>`,
  );
}

function heuristicSummary(cadence: "DAILY" | "WEEKLY", posts: number, alerts: number, tags: string[]): string {
  const when = cadence === "DAILY" ? "Hoy" : "Esta semana";
  if (posts === 0 && alerts === 0) return `${when} no hubo actividad en las keywords ni en los competidores.`;
  const trend = tags.length > 0 ? ` Hashtags que aceleran: ${tags.join(", ")}.` : "";
  return `${when} se registraron ${posts} posts y ${alerts} alertas.${trend}`;
}

export function digestHasSignal(digest: DigestPayload): boolean {
  return digest.posts > 0 || digest.alerts.length > 0 || digest.trends.length > 0;
}
