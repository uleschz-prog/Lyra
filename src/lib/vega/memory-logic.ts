/** Lógica pura de la memoria de Vega: tipos, duplicados, búsqueda y la porción que va al prompt. */

export const memoryKinds = ["profile", "preference", "fact", "journal"] as const;
export type MemoryKind = (typeof memoryKinds)[number];

export const memoryKindLabels: Record<MemoryKind, string> = {
  profile: "perfil",
  preference: "preferencia",
  fact: "dato",
  journal: "diario",
};

const kindAliases: Record<string, MemoryKind> = {
  perfil: "profile",
  profile: "profile",
  preferencia: "preference",
  preferencias: "preference",
  preference: "preference",
  dato: "fact",
  datos: "fact",
  hecho: "fact",
  fact: "fact",
  diario: "journal",
  bitacora: "journal",
  bitácora: "journal",
  journal: "journal",
};

export function parseKind(value: unknown): MemoryKind {
  if (typeof value !== "string") return "fact";
  return kindAliases[value.trim().toLowerCase()] ?? "fact";
}

export type MemoryItem = { id: string; content: string; kind: string; updatedAt: string };

export const MEMORY_MAX_LENGTH = 300;

export function normalizeContent(raw: string) {
  return raw.replace(/\s+/g, " ").trim().slice(0, MEMORY_MAX_LENGTH);
}

export function canonical(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ@.\s]/g, " ")
    // Conserva puntos dentro de correos o dominios, pero no al final de una frase.
    .replace(/\.(?![a-z0-9])|(?<![a-z0-9])\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const stopwords = new Set(
  "que con para por los las del una uno unos unas este esta esto ese esa eso como mas pero sus son fue ser hay muy sin sobre tiene tengo quiero mis mi tu su le les lo al el la de en y a o es se me te nos ya si no".split(" "),
);

export function tokens(text: string) {
  return new Set(
    canonical(text)
      .split(" ")
      .map((word) => word.replace(/^\.+|\.+$/g, ""))
      .filter((word) => word.length >= 3 && !stopwords.has(word)),
  );
}

export function similarity(left: string, right: string) {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** "exact" si es el mismo dato; "similar" si es casi igual (se actualiza); null si es nuevo. */
export function duplicateOf<T extends { content: string }>(items: T[], content: string): { item: T; match: "exact" | "similar" } | null {
  const target = canonical(content);
  const exact = items.find((item) => canonical(item.content) === target);
  if (exact) return { item: exact, match: "exact" };
  const size = tokens(content).size;
  if (size < 3) return null;
  let best: { item: T; score: number } | null = null;
  for (const item of items) {
    const score = similarity(item.content, content);
    if (score >= 0.75 && (!best || score > best.score)) best = { item, score };
  }
  return best ? { item: best.item, match: "similar" } : null;
}

function score(item: MemoryItem, query: Set<string>) {
  if (query.size === 0) return 0;
  const words = tokens(item.content);
  let total = 0;
  for (const word of query) {
    if (words.has(word)) total += 2;
    else if ([...words].some((candidate) => candidate.startsWith(word.slice(0, 5)) && word.length >= 5)) total += 1;
  }
  return total;
}

/** Búsqueda por palabras clave (sin acentos, con coincidencia por raíz). */
export function searchMemoryList(items: MemoryItem[], query: string, limit = 8) {
  const words = tokens(query);
  return items
    .map((item) => ({ item, score: score(item, words) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || right.item.updatedAt.localeCompare(left.item.updatedAt))
    .slice(0, limit)
    .map((entry) => entry.item);
}

export const PROMPT_MEMORY_CHARS = 3_000;
const JOURNAL_IN_PROMPT = 5;

/**
 * Elige qué recuerdos van al prompt de este turno, con tope de caracteres
 * (~750 tokens): perfil y preferencias primero, luego lo relacionado con el
 * mensaje, luego lo más reciente.
 */
export function selectMemoriesForPrompt(items: MemoryItem[], message: string, charCap = PROMPT_MEMORY_CHARS) {
  const byRecent = [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const ordered: MemoryItem[] = [];
  const seen = new Set<string>();
  const push = (item: MemoryItem) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    ordered.push(item);
  };
  byRecent.filter((item) => item.kind === "profile" || item.kind === "preference").forEach(push);
  searchMemoryList(items, message, 15).forEach(push);
  byRecent.filter((item) => item.kind === "fact").forEach(push);
  byRecent.filter((item) => item.kind === "journal").slice(0, JOURNAL_IN_PROMPT).forEach(push);

  const selected: MemoryItem[] = [];
  let used = 0;
  for (const item of ordered) {
    const cost = item.content.length + 24;
    if (used + cost > charCap) continue;
    used += cost;
    selected.push(item);
  }
  return { selected, omitted: items.length - selected.length };
}

export function memoryPrompt(selected: MemoryItem[], omitted = 0) {
  if (selected.length === 0 && omitted === 0) {
    return "Todavía no recuerdas nada del socio. Cuando comparta un dato duradero, guárdalo con recordar.";
  }
  const lines = selected.map((item) => `- [${item.id}] (${memoryKindLabels[parseKind(item.kind)]}) ${item.content}`);
  return [
    "Lo que recuerdas del socio (de conversaciones anteriores). Úsalo con naturalidad, sin recitarlo:",
    ...lines,
    omitted > 0 ? `Hay ${omitted} recuerdo${omitted === 1 ? "" : "s"} más que no se muestran; usa buscar_memoria si necesitas algo que no está aquí.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
