// Vega v2 · alcance por agente (lógica pura).
//
// Cada agente tiene su propia memoria y sus propias rutinas. Los datos de tipo «profile»
// (quién es el socio y su negocio) se comparten entre todos sus agentes. Lo guardado
// antes de v2 (agentId = null) pertenece al agente principal.

export type AgentScope = { agentId: string; isDefault: boolean };

/** Dueño de un registro: el agente principal también es dueño de los registros sin agente. */
export function ownedWhere(scope: AgentScope | null | undefined) {
  if (!scope) return {};
  return scope.isDefault ? { OR: [{ agentId: scope.agentId }, { agentId: null }] } : { agentId: scope.agentId };
}

/** Memoria visible para un agente: la suya más los datos de perfil compartidos. */
export function memoryWhere(scope: AgentScope | null | undefined) {
  if (!scope) return {};
  const own = scope.isDefault ? [{ agentId: scope.agentId }, { agentId: null }] : [{ agentId: scope.agentId }];
  return { OR: [...own, { kind: "profile" }] };
}

export function ownsRecord(scope: AgentScope | null | undefined, agentId: string | null | undefined) {
  if (!scope) return true;
  return agentId === scope.agentId || (scope.isDefault && !agentId);
}

/** ¿Este agente puede ver este recuerdo? */
export function canSeeMemory(scope: AgentScope | null | undefined, memory: { agentId?: string | null; kind: string }) {
  return memory.kind === "profile" || ownsRecord(scope, memory.agentId ?? null);
}

export type PersonaTone = "cercano" | "profesional" | "entusiasta" | "directo";
export type Persona = {
  tone?: PersonaTone;
  /** tú | usted */
  address?: "tu" | "usted";
  emojis?: "no" | "pocos" | "si";
  length?: "breve" | "detallada";
  /** Reglas propias del agente («nunca…», «siempre…»). */
  rules?: string;
};

const tones: PersonaTone[] = ["cercano", "profesional", "entusiasta", "directo"];

export function parsePersona(raw: unknown): Persona {
  if (!raw || typeof raw !== "object") return {};
  const value = raw as Record<string, unknown>;
  const persona: Persona = {};
  if (tones.includes(value.tone as PersonaTone)) persona.tone = value.tone as PersonaTone;
  if (value.address === "tu" || value.address === "usted") persona.address = value.address;
  if (value.emojis === "no" || value.emojis === "pocos" || value.emojis === "si") persona.emojis = value.emojis;
  if (value.length === "breve" || value.length === "detallada") persona.length = value.length;
  if (typeof value.rules === "string" && value.rules.trim()) persona.rules = value.rules.trim().slice(0, 600);
  return persona;
}

/** Instrucciones de personalidad para el sistema (vacío si no hay nada configurado). */
export function personaPrompt(persona: Persona) {
  const lines: string[] = [];
  if (persona.tone) {
    const tone: Record<PersonaTone, string> = {
      cercano: "cálido y cercano, como alguien de confianza",
      profesional: "profesional y cuidado, sin rigidez",
      entusiasta: "entusiasta y motivador, con energía",
      directo: "directo y al grano, sin rodeos",
    };
    lines.push(`Tono: ${tone[persona.tone]}.`);
  }
  if (persona.address) lines.push(persona.address === "usted" ? "Habla de usted al socio." : "Tutea al socio.");
  if (persona.emojis) lines.push(persona.emojis === "no" ? "No uses emojis." : persona.emojis === "pocos" ? "Usa emojis con moderación (uno o dos como máximo)." : "Puedes usar emojis con naturalidad.");
  if (persona.length) lines.push(persona.length === "breve" ? "Respuestas breves: ve a lo esencial." : "Respuestas detalladas cuando ayuden a entender.");
  if (persona.rules) lines.push(`Reglas del socio para este agente: ${persona.rules}`);
  return lines.length ? `Personalidad configurada por el socio:\n- ${lines.join("\n- ")}` : "";
}
