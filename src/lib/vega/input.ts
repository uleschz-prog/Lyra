export function parseCompetitorUsernames(value: unknown): { ok: true; usernames: string[] } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "El cuerpo debe ser JSON." };
  const raw = (value as { usernames?: unknown }).usernames;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 10) {
    return { ok: false, error: "Envía de 1 a 10 usuarios de X." };
  }
  const usernames: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") return { ok: false, error: "Cada usuario debe ser texto." };
    const username = item.trim().replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9_]{1,15}$/.test(username)) {
      return { ok: false, error: "Hay un usuario de X que no es válido." };
    }
    if (seen.has(username)) continue;
    seen.add(username);
    usernames.push(username);
  }
  if (usernames.length === 0) return { ok: false, error: "Envía de 1 a 10 usuarios de X." };
  return { ok: true, usernames };
}

export function parseListeningInput(value: unknown): { ok: true; keywords: string[]; competitors: string[] } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "El cuerpo debe ser JSON." };
  const body = value as { keywords?: unknown; competitors?: unknown };
  if (!Array.isArray(body.keywords) && !Array.isArray(body.competitors)) {
    return { ok: false, error: "Envía keywords o competidores." };
  }
  const keywords = normalizeKeywords(body.keywords);
  const competitors = normalizeCompetitors(body.competitors);
  if ("error" in keywords) return keywords;
  if ("error" in competitors) return competitors;
  if (keywords.values.length === 0 && competitors.values.length === 0) {
    return { ok: false, error: "Envía al menos un término válido." };
  }
  return { ok: true, keywords: keywords.values, competitors: competitors.values };
}

export function parseScheduleInput(value: unknown): { ok: true; cadence: "DAILY" | "WEEKLY"; enabled: boolean } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "El cuerpo debe ser JSON." };
  const body = value as { cadence?: unknown; enabled?: unknown };
  if (body.cadence !== "DAILY" && body.cadence !== "WEEKLY") return { ok: false, error: "La cadencia debe ser DAILY o WEEKLY." };
  if (typeof body.enabled !== "boolean") return { ok: false, error: "Indica si el reporte queda activo." };
  return { ok: true, cadence: body.cadence, enabled: body.enabled };
}

export class ListeningLimitError extends Error {
  constructor() {
    super("Llegaste al máximo de 20 términos.");
    this.name = "ListeningLimitError";
  }
}

function normalizeKeywords(value: unknown): { values: string[] } | { ok: false; error: string } {
  if (value == null) return { values: [] };
  if (!Array.isArray(value) || value.length > 20) return { ok: false, error: "Puedes enviar hasta 20 keywords." };
  const values: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") return { ok: false, error: "Cada keyword debe ser texto." };
    const keyword = item.trim().replace(/\s+/g, " ").toLowerCase();
    if (keyword.length < 2 || keyword.length > 80) return { ok: false, error: "Cada keyword debe tener entre 2 y 80 caracteres." };
    if (seen.has(keyword)) continue;
    seen.add(keyword);
    values.push(keyword);
  }
  return { values };
}

function normalizeCompetitors(value: unknown): { values: string[] } | { ok: false; error: string } {
  if (value == null) return { values: [] };
  if (!Array.isArray(value) || value.length > 20) return { ok: false, error: "Puedes enviar hasta 20 competidores." };
  if (value.length === 0) return { values: [] };
  const parsed = parseCompetitorUsernames({ usernames: value });
  if (!parsed.ok) return parsed;
  return { values: parsed.usernames };
}
