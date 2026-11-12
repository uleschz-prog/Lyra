// Armado de consultas para la búsqueda reciente de X API v2.
// Origen: rama cursor/vega-market-intel-6c56 (PR #7), adaptado a la Fase 8.

/** Largo máximo de una consulta de búsqueda reciente (planes que no son Enterprise). */
export const X_QUERY_MAX = 512;

export function extractHashtags(text: string): string[] {
  const tags = text.match(/#([\p{L}\p{N}_]{2,40})/gu) ?? [];
  return [...new Set(tags.map((tag) => tag.slice(1).toLowerCase()))];
}

/** Palabra clave o frase → término seguro (frases entre comillas). */
export function keywordTerm(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^#/, "")
    .replace(/[^\p{L}\p{N}\s_]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 2 || cleaned.length > 60) return null;
  return /\s/.test(cleaned) ? `"${cleaned}"` : cleaned;
}

/** @usuario → nombre limpio (sin @, en minúsculas) o null si no es válido. */
export function cleanHandle(raw: string): string | null {
  const username = raw.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "").split(/[/?#]/)[0].toLowerCase();
  return /^[a-z0-9_]{1,15}$/.test(username) ? username : null;
}

export function competitorTerm(raw: string): string | null {
  const username = cleanHandle(raw);
  return username ? `from:${username}` : null;
}

export function mentionTerm(raw: string): string | null {
  const username = cleanHandle(raw);
  return username ? `@${username}` : null;
}

function lang(raw: string | undefined) {
  const code = raw?.trim().toLowerCase();
  return code && /^[a-z]{2}$/.test(code) ? code : null;
}

/**
 * Consulta libre del socio. Se aceptan los operadores de X que escriba (from:, #, "frase", -palabra, lang:),
 * se quitan los que piden acceso de pago extra y se agrega -is:retweet salvo que pida retuits.
 */
export function userQuery(raw: string, options: { lang?: string } = {}): string | null {
  let query = raw.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (query.length < 2) return null;
  // Operadores que la búsqueda reciente no admite o que cambian el costo.
  query = query.replace(/\b(place|place_country|point_radius|bounding_box|has:geo|sample):\S*/gi, "").trim();
  const code = lang(options.lang);
  if (code && !/\blang:/i.test(query)) query = `${query} lang:${code}`;
  if (!/\bis:retweet\b/i.test(query)) query = `${query} -is:retweet`;
  if (query.length > X_QUERY_MAX) return null;
  return query;
}

/** Palabras clave + cuentas → una sola consulta OR (menciones y posts de las cuentas). */
export function monitorQuery(input: { keywords: string[]; handles: string[]; lang?: string | null }): string | null {
  const terms: string[] = [];
  for (const keyword of input.keywords) {
    const term = keywordTerm(keyword);
    if (term && !terms.includes(term)) terms.push(term);
  }
  for (const handle of input.handles) {
    const mention = mentionTerm(handle);
    if (mention && !terms.includes(mention)) terms.push(mention);
  }
  if (!terms.length) return null;
  const code = lang(input.lang ?? undefined);
  const suffix = `${code ? ` lang:${code}` : ""} -is:retweet`;
  const used: string[] = [];
  for (const term of terms) {
    const next = `(${[...used, term].join(" OR ")})${suffix}`;
    if (next.length > X_QUERY_MAX) break;
    used.push(term);
  }
  return used.length ? `(${used.join(" OR ")})${suffix}` : null;
}

/** Tema o palabras clave para tendencias → consulta OR. */
export function topicQuery(keywords: string[], langCode?: string) {
  return monitorQuery({ keywords, handles: [], lang: langCode ?? null });
}
