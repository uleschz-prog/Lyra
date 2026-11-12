// Métricas sin modelo sobre posts de X: interacción, temas, tendencias y sentimiento.
// acceleratingHashtags/countHashtags vienen de la rama cursor/vega-market-intel-6c56 (PR #7).
import type { XCountBucket, XPost, XUser } from "@/lib/vega/x/client";
import { classifyPost, summarizeSentiment, type SentimentLabel } from "@/lib/vega/x/sentiment";

export type HashtagCount = { tag: string; count: number };
export type AcceleratingTag = { tag: string; recent: number; previous: number; acceleration: number };

export function countHashtags(tags: string[]): HashtagCount[] {
  const counts = new Map<string, number>();
  for (const tag of tags) counts.set(tag.toLowerCase(), (counts.get(tag.toLowerCase()) ?? 0) + 1);
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function acceleratingHashtags(input: { recent: HashtagCount[]; previous: HashtagCount[]; minRecent?: number; minAcceleration?: number }): AcceleratingTag[] {
  const minRecent = input.minRecent ?? 3;
  const minAcceleration = input.minAcceleration ?? 1;
  const previous = new Map(input.previous.map((item) => [item.tag, item.count]));
  const found: AcceleratingTag[] = [];
  for (const item of input.recent) {
    const before = previous.get(item.tag) ?? 0;
    if (item.count < minRecent || item.count <= before) continue;
    const acceleration = (item.count - before) / Math.max(before, 1);
    if (acceleration < minAcceleration) continue;
    found.push({ tag: item.tag, recent: item.count, previous: before, acceleration: Math.round(acceleration * 100) / 100 });
  }
  return found.sort((a, b) => b.acceleration - a.acceleration || b.recent - a.recent);
}

const STOPWORDS = new Set(
  (
    "a al algo ante antes como con contra cual cuando de del desde donde dos el ella ellos en entre era es esa ese eso esta este esto estos fue ha hay hasta la las le les lo los mas me mi mis muy nada ni no nos o otra otro para pero poco por porque que quien se sea ser si sin sobre son su sus tambien te tiene todo todos tu tus un una uno unos y ya yo " +
    "the a an and are as at be but by for from has have i if in is it its me my no not of on or our so that the their them there they this to was we what when which who will with you your rt amp https http co"
  ).split(" "),
);

export function topTerms(texts: string[], limit = 8): Array<{ term: string; count: number }> {
  const counts = new Map<string, number>();
  for (const text of texts) {
    const words = new Set(
      text
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/[@#][\p{L}\p{N}_]+/gu, " ")
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .match(/[a-z0-9ñ]{4,}/g) ?? [],
    );
    for (const word of words) if (!STOPWORDS.has(word) && !/^\d+$/.test(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

export function interactions(post: XPost) {
  return post.metrics.likes + post.metrics.reposts + post.metrics.replies + post.metrics.quotes;
}

export function postUrl(post: Pick<XPost, "author" | "id">) {
  return `https://x.com/${post.author === "desconocido" ? "i" : post.author}/status/${post.id}`;
}

const clip = (text: string, max = 280) => (text.length > max ? `${text.slice(0, max)}…` : text);

export function postView(post: XPost, sentiment?: SentimentLabel) {
  return {
    autor: post.author === "desconocido" ? null : `@${post.author}`,
    fecha: post.postedAt.toISOString(),
    texto: clip(post.text.replace(/\s+/g, " ")),
    me_gusta: post.metrics.likes,
    reposts: post.metrics.reposts,
    respuestas: post.metrics.replies,
    ...(post.metrics.impressions !== null ? { vistas: post.metrics.impressions } : {}),
    sentimiento: sentiment ?? classifyPost(post.text),
    url: postUrl(post),
  };
}

const average = (values: number[]) => (values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : 0);

export function competitorSummary(handle: string, posts: XPost[], users: XUser[], now: Date) {
  const user = users.find((item) => item.username === handle) ?? null;
  const labels = posts.map((post) => classifyPost(post.text));
  const perPost = posts.map(interactions);
  const days = posts.length ? Math.max(1, (now.getTime() - Math.min(...posts.map((post) => post.postedAt.getTime()))) / 86_400_000) : 7;
  const avgInteractions = average(perPost);
  const impressions = posts.map((post) => post.metrics.impressions).filter((value): value is number => value !== null);
  const ranked = posts.map((post, index) => ({ post, index, score: perPost[index] })).sort((a, b) => b.score - a.score);
  return {
    cuenta: `@${handle}`,
    perfil: user
      ? { nombre: user.name, verificada: user.verified, seguidores: user.followers, siguiendo: user.following, bio: user.description }
      : null,
    periodo: "últimos 7 días (límite de la búsqueda reciente de X)",
    posts_analizados: posts.length,
    posts_por_dia: Math.round((posts.length / days) * 10) / 10,
    interaccion: {
      promedio_por_post: avgInteractions,
      me_gusta_promedio: average(posts.map((post) => post.metrics.likes)),
      reposts_promedio: average(posts.map((post) => post.metrics.reposts)),
      respuestas_promedio: average(posts.map((post) => post.metrics.replies)),
      ...(impressions.length ? { vistas_promedio: average(impressions) } : {}),
      ...(user?.followers ? { tasa_sobre_seguidores_pct: Math.round((avgInteractions / user.followers) * 10000) / 100 } : {}),
    },
    temas: {
      hashtags: countHashtags(posts.flatMap((post) => post.hashtags)).slice(0, 8),
      palabras: topTerms(posts.map((post) => post.text)),
    },
    sentimiento: summarizeSentiment(labels),
    mejores_posts: ranked.slice(0, 3).map(({ post, index }) => postView(post, labels[index])),
  };
}

/** Volumen: últimas 24 h contra las 24 h anteriores, y serie diaria. */
export function volumeTrend(buckets: XCountBucket[], now: Date) {
  const hour = 3_600_000;
  const sum = (from: number, to: number) =>
    buckets.filter((bucket) => bucket.start.getTime() >= from && bucket.start.getTime() < to).reduce((total, bucket) => total + bucket.count, 0);
  const last24 = sum(now.getTime() - 24 * hour, now.getTime() + hour);
  const prev24 = sum(now.getTime() - 48 * hour, now.getTime() - 24 * hour);
  const daily = new Map<string, number>();
  for (const bucket of buckets) {
    const day = bucket.start.toISOString().slice(0, 10);
    daily.set(day, (daily.get(day) ?? 0) + bucket.count);
  }
  return {
    ultimas_24h: last24,
    previas_24h: prev24,
    cambio_pct: prev24 ? Math.round(((last24 - prev24) / prev24) * 100) : last24 ? null : 0,
    total_7_dias: buckets.reduce((total, bucket) => total + bucket.count, 0),
    por_dia: [...daily.entries()].sort().map(([dia, posts]) => ({ dia, posts })),
  };
}

export function topicSummary(posts: XPost[], now: Date) {
  const labels = posts.map((post) => classifyPost(post.text));
  const cut = now.getTime() - 12 * 3_600_000;
  const recent = posts.filter((post) => post.postedAt.getTime() >= cut);
  const older = posts.filter((post) => post.postedAt.getTime() < cut);
  const ranked = posts.map((post, index) => ({ post, index, score: interactions(post) })).sort((a, b) => b.score - a.score);
  const authors = countHashtags(posts.map((post) => post.author).filter((author) => author !== "desconocido")).slice(0, 5);
  return {
    posts_muestra: posts.length,
    hashtags: countHashtags(posts.flatMap((post) => post.hashtags)).slice(0, 10),
    hashtags_en_aceleracion: acceleratingHashtags({
      recent: countHashtags(recent.flatMap((post) => post.hashtags)),
      previous: countHashtags(older.flatMap((post) => post.hashtags)),
      minRecent: 2,
    }).slice(0, 5),
    palabras: topTerms(posts.map((post) => post.text), 10),
    cuentas_mas_activas: authors.map((item) => ({ cuenta: `@${item.tag}`, posts: item.count })),
    sentimiento: summarizeSentiment(labels),
    posts_destacados: ranked.slice(0, 3).map(({ post, index }) => postView(post, labels[index])),
  };
}
