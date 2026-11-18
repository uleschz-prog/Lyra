// Inicio de Vega: lista de agentes con su último mensaje (lógica pura, sin React).
//
// El favorito se guarda en el navegador (localStorage), así no hace falta migración. Si no hay
// favorito, el segundo lugar del encabezado lo ocupa el agente con la conversación más reciente.

export type AgentLastMessage = {
  /** Una línea legible del último mensaje (sin Markdown ni saltos). */
  text: string;
  /** true si el último mensaje lo escribió el socio. */
  fromUser: boolean;
  /** Fecha del último mensaje (ISO). */
  at: string;
  /** Conversación donde está, para abrirla directo. */
  chatId: string;
};

type HomeAgent = { id: string; name: string; specialty?: string; isDefault: boolean; last?: AgentLastMessage | null };

export const favoriteStorageKey = "lyra-vega-favorite";

/** Quita Markdown y saltos; recorta a una línea. null si no queda texto. */
export function previewText(content: string | null | undefined, max = 90) {
  const text = (content ?? "").replace(/[*_`#>]+/g, "").replace(/\s+/g, " ").trim().slice(0, max);
  return text || null;
}

export function lastMessageOf(
  message: { content: string; role: string; createdAt: Date | string; conversationId: string } | null | undefined,
): AgentLastMessage | null {
  if (!message) return null;
  const text = previewText(message.content);
  if (!text) return null;
  const at = message.createdAt instanceof Date ? message.createdAt.toISOString() : new Date(message.createdAt).toISOString();
  return { text, fromUser: message.role === "user", at, chatId: message.conversationId };
}

function dayKey(date: Date, timeZone?: string) {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(date);
}

/**
 * Fecha corta en español de México, como en una bandeja de mensajes:
 * «ahora», «14:05» (hoy), «ayer», «lun.» (esta semana), «30 oct.» (este año) o «30 oct. 2025».
 */
export function relativeDay(iso: string | null | undefined, now: Date = new Date(), timeZone?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diff = now.getTime() - date.getTime();
  if (diff >= 0 && diff < 60_000) return "ahora";
  const today = dayKey(now, timeZone);
  if (dayKey(date, timeZone) === today) {
    return new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(date);
  }
  if (dayKey(date, timeZone) === dayKey(new Date(now.getTime() - 86_400_000), timeZone)) return "ayer";
  if (diff > 0 && diff < 6 * 86_400_000) {
    return new Intl.DateTimeFormat("es-MX", { weekday: "short", timeZone }).format(date);
  }
  const sameYear = new Intl.DateTimeFormat("en", { year: "numeric", timeZone }).format(date) === new Intl.DateTimeFormat("en", { year: "numeric", timeZone }).format(now);
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone }).format(date);
}

function lastTime(agent: HomeAgent) {
  const time = agent.last ? new Date(agent.last.at).getTime() : Number.NaN;
  return Number.isNaN(time) ? -Infinity : time;
}

/** Más reciente primero; los que no tienen mensajes conservan su orden original al final. */
export function byRecent<T extends HomeAgent>(agents: T[]) {
  return agents
    .map((agent, index) => ({ agent, index }))
    .sort((a, b) => lastTime(b.agent) - lastTime(a.agent) || a.index - b.index)
    .map((item) => item.agent);
}

/**
 * Encabezado: Vega (el agente principal) y, junto a él, el favorito; si no hay favorito válido,
 * el agente con la conversación más reciente. Regresa también el resto, para la lista.
 */
export function homeLayout<T extends HomeAgent>(agents: T[], favoriteId: string | null | undefined) {
  const main = agents.find((agent) => agent.isDefault) ?? null;
  const others = byRecent(agents.filter((agent) => agent !== main));
  const favorite = favoriteId ? (others.find((agent) => agent.id === favoriteId) ?? null) : null;
  const companion = favorite ?? others[0] ?? null;
  return {
    main,
    companion,
    companionIsFavorite: Boolean(favorite),
    rest: others.filter((agent) => agent !== companion),
  };
}

export function matchesAgent(agent: HomeAgent, query: string) {
  const needle = query.trim().toLocaleLowerCase("es-MX");
  if (!needle) return true;
  return [agent.name, agent.specialty, agent.last?.text].some((value) => value?.toLocaleLowerCase("es-MX").includes(needle));
}
