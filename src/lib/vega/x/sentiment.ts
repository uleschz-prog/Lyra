// Filtro de sentimiento sin modelo (gratis y rápido): decide qué posts son negativos
// antes de gastar en IA y alimenta la alerta de crisis.
// Origen: rama cursor/vega-market-intel-6c56 (PR #7). El léxico de español se conserva;
// VADER se reemplaza por un léxico corto de inglés para no agregar dependencias.
//
// Límites: no entiende ironía ni sarcasmo; la negación solo mira las dos palabras
// anteriores; no lematiza (estafa y estafas van por separado); quita acentos.

export type SentimentLabel = "positive" | "negative" | "neutral";

const SPANISH: Record<string, 1 | -1> = {
  excelente: 1, bueno: 1, buena: 1, buenos: 1, buenas: 1, recomendado: 1, recomendada: 1, recomiendo: 1,
  genial: 1, gracias: 1, encanta: 1, encanto: 1, perfecto: 1, perfecta: 1, confiable: 1, rapido: 1, rapida: 1,
  facil: 1, util: 1, calidad: 1, exito: 1, feliz: 1, amor: 1, mejor: 1, mejoro: 1, increible: 1, chido: 1, padre: 1,
  estafa: -1, estafas: -1, estafador: -1, horrible: -1, pesimo: -1, pesima: -1, malo: -1, mala: -1, malos: -1,
  fraude: -1, odio: -1, peor: -1, terrible: -1, crisis: -1, decepcion: -1, decepcionado: -1, basura: -1,
  lento: -1, lenta: -1, caro: -1, engano: -1, mentira: -1, mentiras: -1, queja: -1, quejas: -1, inutil: -1,
  demanda: -1, denuncia: -1, robo: -1, boicot: -1, verguenza: -1, falla: -1, fallas: -1, cancelado: -1,
};

const ENGLISH: Record<string, 1 | -1> = {
  good: 1, great: 1, excellent: 1, love: 1, amazing: 1, awesome: 1, best: 1, recommend: 1, thanks: 1, happy: 1,
  perfect: 1, reliable: 1, fast: 1, easy: 1, useful: 1, nice: 1, win: 1, fantastic: 1,
  bad: -1, terrible: -1, awful: -1, worst: -1, hate: -1, scam: -1, fraud: -1, broken: -1, slow: -1, expensive: -1,
  disappointed: -1, disappointing: -1, useless: -1, lawsuit: -1, boycott: -1, refund: -1, crisis: -1, fail: -1,
  failed: -1, outage: -1, lie: -1, lies: -1, angry: -1, horrible: -1, poor: -1,
};

const NEGATION = new Set(["no", "nunca", "jamas", "ni", "sin", "not", "never", "dont", "isnt", "wasnt", "cant"]);
const INTENSIFIER = new Set(["muy", "super", "demasiado", "bastante", "very", "so", "really", "extremely"]);

function tokens(text: string): string[] {
  const plain = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[@#][\p{L}\p{N}_]+/gu, " ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/'/g, "");
  return plain.match(/[a-z]+/g) ?? [];
}

export function scoreText(text: string): { label: SentimentLabel; score: number; hits: number } {
  const parts = tokens(text);
  let score = 0;
  let hits = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const word = parts[index] ?? "";
    const polarity = SPANISH[word] ?? ENGLISH[word];
    if (!polarity) continue;
    hits += 1;
    let weight: number = polarity;
    const window = parts.slice(Math.max(0, index - 2), index);
    if (window.some((token) => NEGATION.has(token))) weight *= -1;
    if (window.some((token) => INTENSIFIER.has(token))) weight *= 1.5;
    score += weight;
  }
  if (hits === 0) return { label: "neutral", score: 0, hits: 0 };
  const normalized = score / hits;
  const label: SentimentLabel = normalized > 0.2 ? "positive" : normalized < -0.2 ? "negative" : "neutral";
  return { label, score: Math.round(normalized * 100) / 100, hits };
}

export function classifyPost(text: string): SentimentLabel {
  return scoreText(text).label;
}

export type SentimentSummary = { positive: number; negative: number; neutral: number; total: number; negativity: number; positivity: number };

export function summarizeSentiment(labels: SentimentLabel[]): SentimentSummary {
  const counts = { positive: 0, negative: 0, neutral: 0 };
  for (const label of labels) counts[label] += 1;
  const total = labels.length;
  return {
    ...counts,
    total,
    negativity: total ? Math.round((counts.negative / total) * 100) / 100 : 0,
    positivity: total ? Math.round((counts.positive / total) * 100) / 100 : 0,
  };
}

export type CrisisConfig = { threshold: number; minPosts: number; spike: number; cooldownMs: number };

type Env = Record<string, string | undefined>;

function readNumber(raw: string | undefined, fallback: number, min: number, max: number) {
  const value = Number.parseFloat(raw ?? "");
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

/** Umbrales de la alerta de crisis (VEGA_CRISIS_*). */
export function crisisConfig(env: Env = process.env): CrisisConfig {
  return {
    threshold: readNumber(env.VEGA_CRISIS_THRESHOLD, 0.5, 0.05, 1),
    minPosts: Math.round(readNumber(env.VEGA_CRISIS_MIN_POSTS, 5, 1, 1000)),
    spike: readNumber(env.VEGA_CRISIS_SPIKE, 0.25, 0, 1),
    cooldownMs: readNumber(env.VEGA_CRISIS_COOLDOWN_HOURS, 6, 0, 168) * 3_600_000,
  };
}

export type CrisisDecision = { alert: boolean; reason: string | null; negativity: number; sampleSize: number; baseline: number | null };

/**
 * Pico de negatividad: con suficientes posts nuevos, alerta si la proporción negativa
 * pasa el umbral, o si sube `spike` sobre la línea base del monitor. Respeta un enfriamiento
 * para no mandar la misma alerta cada hora, salvo que empeore.
 */
export function evaluateCrisis(input: {
  labels: SentimentLabel[];
  baseline: number | null;
  lastAlertAt: Date | null;
  lastAlertNegativity: number | null;
  now: Date;
  config: CrisisConfig;
}): CrisisDecision {
  const { negativity, total } = summarizeSentiment(input.labels);
  const base = { negativity, sampleSize: total, baseline: input.baseline };
  if (total < input.config.minPosts) return { ...base, alert: false, reason: null };
  const overThreshold = negativity >= input.config.threshold;
  const spiked = input.baseline !== null && negativity >= input.baseline + input.config.spike && negativity >= 0.3;
  if (!overThreshold && !spiked) return { ...base, alert: false, reason: null };
  const cooling = input.lastAlertAt && input.now.getTime() - input.lastAlertAt.getTime() < input.config.cooldownMs;
  if (cooling && negativity <= (input.lastAlertNegativity ?? 0) + 0.1) return { ...base, alert: false, reason: "enfriamiento" };
  return { ...base, alert: true, reason: overThreshold ? "umbral" : "pico" };
}

/** Línea base móvil (EMA) de negatividad; ignora muestras muy chicas. */
export function nextBaseline(previous: number | null, negativity: number, sampleSize: number, minPosts: number) {
  if (sampleSize < Math.max(3, Math.ceil(minPosts / 2))) return previous;
  if (previous === null) return Math.round(negativity * 100) / 100;
  return Math.round((previous * 0.7 + negativity * 0.3) * 100) / 100;
}
