import { extractHashtags } from "./query";

export type XPost = {
  externalId: string;
  author: string;
  text: string;
  postedAt: Date;
  hashtags: string[];
};

export class XRateLimitError extends Error {
  readonly code = "x_rate_limit";

  constructor() {
    super("La X API limitó la ingesta compartida.");
    this.name = "XRateLimitError";
  }
}

export class XAuthError extends Error {
  readonly code = "x_auth";

  constructor() {
    super("La X API rechazó la autenticación de la ingesta compartida.");
    this.name = "XAuthError";
  }
}

export function parseRecentSearch(body: unknown): XPost[] {
  if (!body || typeof body !== "object") return [];
  const users = new Map<string, string>();
  const includes = (body as { includes?: { users?: Array<{ id?: unknown; username?: unknown }> } }).includes?.users ?? [];
  for (const user of includes) {
    if (typeof user?.id === "string" && typeof user.username === "string") users.set(user.id, user.username.toLowerCase());
  }

  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const posts: XPost[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const row = item as {
      id?: unknown;
      text?: unknown;
      author_id?: unknown;
      created_at?: unknown;
      entities?: { hashtags?: Array<{ tag?: unknown }> };
    };
    if (typeof row.id !== "string" || typeof row.text !== "string" || typeof row.created_at !== "string") continue;
    const postedAt = new Date(row.created_at);
    if (Number.isNaN(postedAt.getTime())) continue;
    const entityTags = (row.entities?.hashtags ?? [])
      .map((tag) => (typeof tag.tag === "string" ? tag.tag.toLowerCase() : ""))
      .filter(Boolean);
    const author = typeof row.author_id === "string" ? users.get(row.author_id) ?? "unknown" : "unknown";
    posts.push({
      externalId: row.id,
      author,
      text: row.text,
      postedAt,
      hashtags: [...new Set([...entityTags, ...extractHashtags(row.text)])],
    });
  }
  return posts;
}

export async function searchRecent(
  query: string,
  deps: { fetch: typeof fetch; token: string; baseUrl?: string },
): Promise<XPost[]> {
  const base = (deps.baseUrl ?? "https://api.x.com/2").replace(/\/$/, "");
  const url = new URL(`${base}/tweets/search/recent`);
  url.searchParams.set("query", query);
  url.searchParams.set("max_results", "10");
  url.searchParams.set("tweet.fields", "created_at,entities,author_id");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "username");

  const response = await deps.fetch(url, {
    headers: { authorization: `Bearer ${deps.token}` },
  });
  if (response.status === 401 || response.status === 403) throw new XAuthError();
  if (response.status === 429) throw new XRateLimitError();
  if (!response.ok) throw new Error(`La X API respondió ${response.status}.`);
  return parseRecentSearch(await response.json().catch(() => null));
}
