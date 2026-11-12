// Cliente mínimo de X API v2 (solo lectura, token de app «Bearer»).
// Origen: rama cursor/vega-market-intel-6c56 (PR #7); se agregan métricas, since_id y conteos.
import { extractHashtags } from "@/lib/vega/x/query";

type Env = Record<string, string | undefined>;

export type XMetrics = { likes: number; reposts: number; replies: number; quotes: number; impressions: number | null };

export type XPost = {
  id: string;
  author: string;
  authorName: string | null;
  text: string;
  postedAt: Date;
  lang: string | null;
  hashtags: string[];
  metrics: XMetrics;
};

export type XUser = {
  id: string;
  username: string;
  name: string;
  description: string | null;
  verified: boolean;
  followers: number | null;
  following: number | null;
  posts: number | null;
};

export type XSearchResult = { posts: XPost[]; users: XUser[]; newestId: string | null };
export type XCountBucket = { start: Date; end: Date; count: number };

export class XRateLimitError extends Error {
  readonly code = "x_rate_limit";
  constructor() {
    super("X limitó las consultas por un momento. Intenta en unos minutos.");
    this.name = "XRateLimitError";
  }
}

export class XAuthError extends Error {
  readonly code = "x_auth";
  constructor() {
    super("X rechazó la credencial de LYRA o se acabó el saldo de la cuenta de X.");
    this.name = "XAuthError";
  }
}

export class XRequestError extends Error {
  readonly code = "x_request";
  constructor(readonly status: number) {
    super(status === 400 ? "X no aceptó la búsqueda; prueba con otras palabras." : `X respondió con un error (${status}).`);
    this.name = "XRequestError";
  }
}

export function xConfig(env: Env = process.env) {
  const token = env.X_BEARER_TOKEN?.trim() || "";
  const baseUrl = (env.X_API_BASE?.trim() || "https://api.x.com/2").replace(/\/$/, "");
  return { token, baseUrl, configured: token.length > 0 };
}

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

function parseUser(raw: unknown): XUser | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.username !== "string") return null;
  const metrics = (row.public_metrics ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    username: row.username.toLowerCase(),
    name: typeof row.name === "string" ? row.name : row.username,
    description: typeof row.description === "string" ? row.description.slice(0, 300) : null,
    verified: row.verified === true,
    followers: num(metrics.followers_count),
    following: num(metrics.following_count),
    posts: num(metrics.tweet_count),
  };
}

export function parseRecentSearch(body: unknown): XSearchResult {
  if (!body || typeof body !== "object") return { posts: [], users: [], newestId: null };
  const users = ((body as { includes?: { users?: unknown[] } }).includes?.users ?? []).map(parseUser).filter((user): user is XUser => Boolean(user));
  const byId = new Map(users.map((user) => [user.id, user]));
  const data = (body as { data?: unknown }).data;
  const meta = (body as { meta?: { newest_id?: unknown } }).meta;
  const posts: XPost[] = [];
  for (const item of Array.isArray(data) ? data : []) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.text !== "string" || typeof row.created_at !== "string") continue;
    const postedAt = new Date(row.created_at);
    if (Number.isNaN(postedAt.getTime())) continue;
    const entities = (row.entities ?? {}) as { hashtags?: Array<{ tag?: unknown }> };
    const entityTags = (entities.hashtags ?? []).map((tag) => (typeof tag.tag === "string" ? tag.tag.toLowerCase() : "")).filter(Boolean);
    const author = typeof row.author_id === "string" ? byId.get(row.author_id) : undefined;
    const metrics = (row.public_metrics ?? {}) as Record<string, unknown>;
    posts.push({
      id: row.id,
      author: author?.username ?? "desconocido",
      authorName: author?.name ?? null,
      text: row.text,
      postedAt,
      lang: typeof row.lang === "string" ? row.lang : null,
      hashtags: [...new Set([...entityTags, ...extractHashtags(row.text)])],
      metrics: {
        likes: num(metrics.like_count) ?? 0,
        reposts: num(metrics.retweet_count) ?? 0,
        replies: num(metrics.reply_count) ?? 0,
        quotes: num(metrics.quote_count) ?? 0,
        impressions: num(metrics.impression_count),
      },
    });
  }
  return { posts, users, newestId: typeof meta?.newest_id === "string" ? meta.newest_id : posts[0]?.id ?? null };
}

export function parseCounts(body: unknown): XCountBucket[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => {
      const item = row as { start?: unknown; end?: unknown; tweet_count?: unknown };
      const start = typeof item.start === "string" ? new Date(item.start) : null;
      const end = typeof item.end === "string" ? new Date(item.end) : null;
      const count = num(item.tweet_count);
      return start && end && count !== null && !Number.isNaN(start.getTime()) ? { start, end, count } : null;
    })
    .filter((bucket): bucket is XCountBucket => Boolean(bucket));
}
