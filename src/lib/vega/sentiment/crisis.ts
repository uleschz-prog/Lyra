import type { SentimentLabel } from "./classify";

export type CrisisConfig = {
  threshold: number;
  windowMs: number;
  minPosts: number;
};

export const defaultCrisisConfig: CrisisConfig = {
  threshold: 0.6,
  windowMs: 60 * 60 * 1000,
  minPosts: 5,
};

export type CrisisPost = {
  sentiment: SentimentLabel;
  createdAt: Date;
};

export type CrisisDecision = {
  alert: boolean;
  negativity: number;
  sampleSize: number;
};

export function negativityIndex(labels: SentimentLabel[]): number {
  if (labels.length === 0) return 0;
  return labels.filter((label) => label === "negative").length / labels.length;
}

export function evaluateCrisis(posts: CrisisPost[], config: CrisisConfig, now: Date): CrisisDecision {
  const start = now.getTime() - config.windowMs;
  const inWindow = posts.filter((post) => {
    const time = post.createdAt.getTime();
    return time >= start && time <= now.getTime();
  });
  const negativity = negativityIndex(inWindow.map((post) => post.sentiment));
  const alert = inWindow.length >= config.minPosts && negativity > config.threshold;
  return { alert, negativity, sampleSize: inWindow.length };
}

export function readCrisisConfig(env: NodeJS.ProcessEnv = process.env): CrisisConfig {
  return {
    threshold: readUnit(env.VEGA_CRISIS_THRESHOLD, defaultCrisisConfig.threshold),
    windowMs: readMinutes(env.VEGA_CRISIS_WINDOW_MINUTES, 60) * 60 * 1000,
    minPosts: readCount(env.VEGA_CRISIS_MIN_POSTS, defaultCrisisConfig.minPosts),
  };
}

function readUnit(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) return fallback;
  return value;
}

function readMinutes(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 5 || value > 10_080) return fallback;
  return value;
}

function readCount(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 1_000) return fallback;
  return value;
}
