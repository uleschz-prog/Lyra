import { createHash } from "node:crypto";

export const VEGA_VECTOR_SIZE = 64;

export function embedText(text: string): number[] {
  const vector = new Array<number>(VEGA_VECTOR_SIZE).fill(0);
  const tokens = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (tokens.length === 0) {
    vector[0] = 1;
    return vector;
  }
  for (const token of tokens) {
    let hash = 2166136261;
    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const bucket = Math.abs(hash) % VEGA_VECTOR_SIZE;
    vector[bucket] += hash & 1 ? 1 : -1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

export function toPointId(raw: string): string {
  const hex = createHash("sha256").update(raw).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = "8";
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
