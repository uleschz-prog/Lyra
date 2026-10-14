/**
 * Léxico corto para español de México.
 * Límites: no entiende ironía ni sarcasmo; la negación solo mira las dos
 * palabras anteriores; no lematiza, así que hace falta la forma exacta
 * (estafa y estafas van por separado); quita acentos antes de buscar.
 * "cara" y "caro" se toman como queja de precio y pueden fallar cuando
 * "cara" significa rostro. Sin coincidencias, el texto queda neutro.
 */
export const SPANISH_LEXICON: Record<string, 1 | -1> = {
  excelente: 1,
  bueno: 1,
  buena: 1,
  buenos: 1,
  buenas: 1,
  recomendado: 1,
  recomendada: 1,
  recomiendo: 1,
  genial: 1,
  gracias: 1,
  encanta: 1,
  perfecto: 1,
  perfecta: 1,
  confiable: 1,
  rapido: 1,
  rapida: 1,
  facil: 1,
  util: 1,
  calidad: 1,
  exito: 1,
  feliz: 1,
  amor: 1,
  mejoro: 1,
  estafa: -1,
  estafas: -1,
  estafador: -1,
  horrible: -1,
  pesimo: -1,
  pesima: -1,
  malo: -1,
  mala: -1,
  malos: -1,
  fraude: -1,
  odio: -1,
  peor: -1,
  terrible: -1,
  crisis: -1,
  decepcion: -1,
  basura: -1,
  lento: -1,
  lenta: -1,
  caro: -1,
  cara: -1,
  engano: -1,
  mentira: -1,
  mentiras: -1,
  queja: -1,
  quejas: -1,
  inutil: -1,
  demanda: -1,
  denuncia: -1,
  robo: -1,
};

const NEGATION = new Set(["no", "nunca", "jamas", "ni", "sin"]);
const INTENSIFIER = new Set(["muy", "super", "demasiado", "bastante"]);

export type SpanishScore = {
  label: "positive" | "negative" | "neutral";
  score: number;
  hits: number;
};

function tokens(text: string): string[] {
  const plain = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return plain.match(/[a-z]+/g) ?? [];
}

export function scoreSpanish(text: string): SpanishScore {
  const parts = tokens(text);
  let score = 0;
  let hits = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const polarity = SPANISH_LEXICON[parts[index] ?? ""];
    if (!polarity) continue;
    hits += 1;
    let weight = polarity;
    const window = parts.slice(Math.max(0, index - 2), index);
    if (window.some((token) => NEGATION.has(token))) weight *= -1;
    if (window.some((token) => INTENSIFIER.has(token))) weight *= 1.5;
    score += weight;
  }
  if (hits === 0) return { label: "neutral", score: 0, hits: 0 };
  const normalized = score / hits;
  const label = normalized > 0.2 ? "positive" : normalized < -0.2 ? "negative" : "neutral";
  return { label, score: normalized, hits };
}
