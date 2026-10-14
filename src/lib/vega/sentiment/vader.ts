import { SentimentIntensityAnalyzer } from "vader-sentiment";

export type EnglishScore = {
  label: "positive" | "negative" | "neutral";
  score: number;
};

export function scoreEnglish(text: string): EnglishScore {
  const scores = SentimentIntensityAnalyzer.polarity_scores(text);
  const label = scores.compound >= 0.05 ? "positive" : scores.compound <= -0.05 ? "negative" : "neutral";
  return { label, score: scores.compound };
}
