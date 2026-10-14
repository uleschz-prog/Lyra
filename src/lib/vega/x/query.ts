export function extractHashtags(text: string): string[] {
  const tags = text.match(/#([\p{L}\p{N}_]{2,40})/gu) ?? [];
  return [...new Set(tags.map((tag) => tag.slice(1).toLowerCase()))];
}

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

export function competitorTerm(raw: string): string | null {
  const username = raw.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(username)) return null;
  return `from:${username}`;
}

export function collectTerms(listeners: Array<{ keywords: string[]; competitors: string[] }>): string[] {
  const terms = new Set<string>();
  for (const listener of listeners) {
    for (const keyword of listener.keywords) {
      const term = keywordTerm(keyword);
      if (term) terms.add(term);
    }
    for (const competitor of listener.competitors) {
      const term = competitorTerm(competitor);
      if (term) terms.add(term);
    }
  }
  return [...terms].sort((a, b) => a.localeCompare(b));
}

export function packQueries(terms: string[], options?: { maxChars?: number; maxQueries?: number }): { queries: string[]; deferred: number } {
  const maxChars = options?.maxChars ?? 480;
  const maxQueries = options?.maxQueries ?? 8;
  const suffix = " -is:retweet";
  const queries: string[] = [];
  let current: string[] = [];
  const used = new Set<string>();
  const render = (parts: string[]) => `(${parts.join(" OR ")})${suffix}`;

  const flush = () => {
    if (current.length === 0 || queries.length >= maxQueries) return;
    queries.push(render(current));
    for (const term of current) used.add(term);
    current = [];
  };

  for (const term of terms) {
    if (queries.length >= maxQueries) break;
    if (render([term]).length > maxChars) continue;
    if (current.length > 0 && render([...current, term]).length > maxChars) flush();
    if (queries.length >= maxQueries) break;
    current.push(term);
  }
  flush();
  return { queries, deferred: terms.filter((term) => !used.has(term)).length };
}
