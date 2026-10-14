import { logVega, safeErrorMessage } from "../log";
import { classifyPost, type SentimentLabel } from "../sentiment/classify";
import { evaluateCrisis, type CrisisConfig, defaultCrisisConfig } from "../sentiment/crisis";
import { XRateLimitError, type XPost } from "./client";
import { collectTerms, extractHashtags, keywordTerm, packQueries } from "./query";

export type Listener = {
  profileId: string;
  userId: string;
  packageId: string;
  keywords: string[];
  competitors: string[];
};

export type StoredPost = {
  externalId: string;
  author: string;
  text: string;
  hashtags: string[];
  postedAt: Date;
  sentiment: SentimentLabel;
  score: number;
};

export type FanMatch = {
  externalId: string;
  profileId: string;
  userId: string;
  keywords: string[];
  competitors: string[];
};

export type IngestRunResult = {
  skipped?: "x_not_configured" | "no_listeners";
  queries: number;
  posts: number;
  matches: number;
  alerts: number;
  rateLimited: boolean;
  deferred: number;
};

export function textHasKeyword(text: string, keyword: string): boolean {
  const term = keywordTerm(keyword);
  if (!term) return false;
  const needle = term.replace(/^"|"$/g, "").toLocaleLowerCase("es-MX");
  const haystack = text.toLocaleLowerCase("es-MX");
  if (needle.length <= 3) {
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp(needle)}([^\\p{L}\\p{N}_]|$)`, "iu");
    return pattern.test(haystack) || haystack.includes(`#${needle}`);
  }
  return haystack.includes(needle) || haystack.includes(`#${needle}`);
}

export function fanOut(post: { author: string; text: string; externalId: string }, listeners: Listener[]): FanMatch[] {
  const author = post.author.trim().replace(/^@/, "").toLowerCase();
  const matches: FanMatch[] = [];
  for (const listener of listeners) {
    const keywords = listener.keywords.filter((keyword) => textHasKeyword(post.text, keyword));
    const competitors = listener.competitors
      .map((name) => name.trim().replace(/^@/, "").toLowerCase())
      .filter((name) => name === author);
    if (keywords.length === 0 && competitors.length === 0) continue;
    matches.push({
      externalId: post.externalId,
      profileId: listener.profileId,
      userId: listener.userId,
      keywords,
      competitors,
    });
  }
  return matches;
}

/**
 * La ingesta es un solo proceso para todos los usuarios. Vercel no sostiene el
 * filtered stream de X: es una conexión larga y única por app. El camino de
 * producción es polling de search/recent, empaquetando keywords y competidores
 * en pocas consultas. El worker de Node reutiliza esta misma función para un
 * bucle más corto si más adelante se hospeda fuera de Vercel.
 */
export async function runSharedIngest(deps: {
  listeners: Listener[];
  search: ((query: string) => Promise<XPost[]>) | null;
  existingExternalIds: (ids: string[]) => Promise<Set<string>>;
  save: (posts: StoredPost[], matches: FanMatch[]) => Promise<void>;
  recentSentiments: (profileId: string, keyword: string, since: Date) => Promise<Array<{ text: string; createdAt: Date; sentiment: SentimentLabel }>>;
  hasOpenAlert: (profileId: string, keyword: string, since: Date) => Promise<boolean>;
  createAlert: (alert: {
    profileId: string;
    keyword: string;
    windowStart: Date;
    windowEnd: Date;
    negativity: number;
    threshold: number;
    sampleSize: number;
  }) => Promise<string>;
  setAlertSummary: (id: string, summary: string) => Promise<void>;
  explain: (input: { profileId: string; userId: string; packageId: string; keyword: string; excerpts: string[]; negativity: number }) => Promise<string | null>;
  remember?: (points: Array<{ userId: string; profileId: string; externalId: string; text: string; author: string; postedAt: string }>) => Promise<void>;
  now: Date;
  crisis?: CrisisConfig;
  pack?: { maxChars?: number; maxQueries?: number };
}): Promise<IngestRunResult> {
  const empty = { queries: 0, posts: 0, matches: 0, alerts: 0, rateLimited: false, deferred: 0 };
  if (!deps.search) return { ...empty, skipped: "x_not_configured" };
  const terms = collectTerms(deps.listeners);
  if (terms.length === 0) return { ...empty, skipped: "no_listeners" };

  const packed = packQueries(terms, deps.pack);
  const seen = new Map<string, XPost>();
  let rateLimited = false;
  for (const query of packed.queries) {
    try {
      const page = await deps.search(query);
      for (const post of page) {
        if (!seen.has(post.externalId)) seen.set(post.externalId, post);
      }
    } catch (error) {
      if (error instanceof XRateLimitError) {
        rateLimited = true;
        logVega("warn", "vega.ingest.rate_limited", { queries: packed.queries.length });
        break;
      }
      throw error;
    }
  }

  const existing = await deps.existingExternalIds([...seen.keys()]);
  const posts: StoredPost[] = [];
  for (const post of seen.values()) {
    if (existing.has(post.externalId)) continue;
    const classified = classifyPost(post.text);
    posts.push({
      externalId: post.externalId,
      author: post.author.trim().replace(/^@/, "").toLowerCase(),
      text: post.text,
      hashtags: post.hashtags.length > 0 ? post.hashtags : extractHashtags(post.text),
      postedAt: post.postedAt,
      sentiment: classified.label,
      score: classified.score,
    });
  }

  const matches = posts.flatMap((post) => fanOut(post, deps.listeners));
  if (posts.length > 0) await deps.save(posts, matches);
  if (deps.remember && matches.length > 0) {
    try {
      await deps.remember(
        matches.map((match) => {
          const post = posts.find((item) => item.externalId === match.externalId);
          return {
            userId: match.userId,
            profileId: match.profileId,
            externalId: match.externalId,
            text: post?.text ?? "",
            author: post?.author ?? "",
            postedAt: post?.postedAt.toISOString() ?? deps.now.toISOString(),
          };
        }),
      );
    } catch (error) {
      logVega("warn", "vega.ingest.memory_skipped", { message: safeErrorMessage(error) });
    }
  }

  const crisis = deps.crisis ?? defaultCrisisConfig;
  const since = new Date(deps.now.getTime() - crisis.windowMs);
  const groups = new Map<string, { profileId: string; userId: string; packageId: string; keyword: string }>();
  for (const match of matches) {
    const listener = deps.listeners.find((item) => item.profileId === match.profileId);
    if (!listener) continue;
    for (const keyword of match.keywords) {
      groups.set(`${match.profileId}:${keyword}`, { profileId: match.profileId, userId: listener.userId, packageId: listener.packageId, keyword });
    }
  }

  let alerts = 0;
  for (const group of groups.values()) {
    const prior = await deps.recentSentiments(group.profileId, group.keyword, since);
    const fresh = posts
      .filter((post) => matches.some((match) => match.externalId === post.externalId && match.profileId === group.profileId && match.keywords.includes(group.keyword)))
      .map((post) => ({ text: post.text, createdAt: post.postedAt, sentiment: post.sentiment }));
    const decision = evaluateCrisis(
      [...prior, ...fresh].map((item) => ({ sentiment: item.sentiment, createdAt: item.createdAt })),
      crisis,
      deps.now,
    );
    if (!decision.alert) continue;
    if (await deps.hasOpenAlert(group.profileId, group.keyword, since)) continue;
    const id = await deps.createAlert({
      profileId: group.profileId,
      keyword: group.keyword,
      windowStart: since,
      windowEnd: deps.now,
      negativity: decision.negativity,
      threshold: crisis.threshold,
      sampleSize: decision.sampleSize,
    });
    alerts += 1;
    const excerpts = [...prior, ...fresh]
      .filter((item) => item.sentiment === "negative")
      .slice(0, 5)
      .map((item) => item.text.slice(0, 180));
    const summary = await deps.explain({ ...group, excerpts, negativity: decision.negativity });
    if (summary) await deps.setAlertSummary(id, summary.slice(0, 2000));
  }

  return {
    queries: packed.queries.length,
    posts: posts.length,
    matches: matches.length,
    alerts,
    rateLimited,
    deferred: packed.deferred,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
