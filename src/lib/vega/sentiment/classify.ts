import { scoreSpanish } from "./spanish";
import { scoreEnglish } from "./vader";

export type SentimentLabel = "positive" | "negative" | "neutral";

export type Classification = {
  label: SentimentLabel;
  score: number;
  language: "es" | "en";
};

const spanishHints = /\b(el|la|los|las|de|que|en|un|una|por|con|para|es|esta|muy|del|al|esto)\b/gi;
const englishHints = /\b(the|and|is|to|of|for|this|with|you|it|are|was)\b/gi;

export function detectLanguage(text: string): "es" | "en" {
  if (/[ñ¿¡]/i.test(text)) return "es";
  const spanish = text.match(spanishHints)?.length ?? 0;
  const english = text.match(englishHints)?.length ?? 0;
  return spanish > english ? "es" : "en";
}

export function classifyPost(text: string): Classification {
  const language = detectLanguage(text);
  if (language === "es") {
    const score = scoreSpanish(text);
    return { label: score.label, score: score.score, language: "es" };
  }
  const english = scoreEnglish(text);
  if (english.label === "neutral") {
    const spanish = scoreSpanish(text);
    if (spanish.hits > 0) return { label: spanish.label, score: spanish.score, language: "es" };
  }
  return { label: english.label, score: english.score, language: "en" };
}
