// Vega v2 · mascotas de agentes (lógica pura, sin React).
//
// Cada agente tiene una mascota: un cuerpo con forma de gota, nube, fantasma… y dos ojos
// blancos ovalados. Se guarda en VegaAgent.avatar con un código corto «m:<forma><color>»
// (p. ej. «m:gp» = fantasma rosa), así cabe en el campo de siempre y no hace falta migración.
// Sin código (datos de antes o un emoji), la mascota sale fija a partir del id del agente.

export const mascotShapes = ["vega", "drop", "blob", "bumps", "star", "pill", "ghost", "cloud"] as const;
export type MascotShape = (typeof mascotShapes)[number];

export const mascotColors = ["violet", "cyan", "emerald", "pink", "amber", "indigo", "black"] as const;
export type MascotColor = (typeof mascotColors)[number];

export type Mascot = { shape: MascotShape; color: MascotColor };

const shapeCodes: Record<MascotShape, string> = { vega: "v", drop: "d", blob: "b", bumps: "w", star: "s", pill: "p", ghost: "g", cloud: "c" };
const colorCodes: Record<MascotColor, string> = { violet: "v", cyan: "c", emerald: "e", pink: "p", amber: "a", indigo: "i", black: "k" };

export const shapeLabels: Record<MascotShape, string> = {
  vega: "Vega",
  drop: "Gota",
  blob: "Burbuja",
  bumps: "Orejitas",
  star: "Estrella",
  pill: "Píldora",
  ghost: "Fantasma",
  cloud: "Nube",
};

export const colorLabels: Record<MascotColor, string> = {
  violet: "Violeta",
  cyan: "Cian",
  emerald: "Esmeralda",
  pink: "Rosa",
  amber: "Ámbar",
  indigo: "Índigo",
  black: "Negro",
};

/** Degradado de cada color (claro arriba → base → sombra). Paleta de LYRA y vecinos. */
export const mascotPalette: Record<MascotColor, { light: string; base: string; deep: string }> = {
  violet: { light: "#A78BFA", base: "#7C3AED", deep: "#5B21B6" },
  cyan: { light: "#67E8F9", base: "#06B6D4", deep: "#0E7490" },
  emerald: { light: "#6EE7B7", base: "#10B981", deep: "#047857" },
  pink: { light: "#F9A8D4", base: "#EC4899", deep: "#BE185D" },
  amber: { light: "#FCD34D", base: "#F59E0B", deep: "#B45309" },
  indigo: { light: "#A5B4FC", base: "#6366F1", deep: "#4338CA" },
  black: { light: "#4B4760", base: "#24212F", deep: "#0B0A10" },
};

/** Formas que puede elegir un agente que no es el principal (la de Vega es suya). */
export const pickableShapes = mascotShapes.filter((shape) => shape !== "vega");

export function encodeMascot(mascot: Mascot) {
  return `m:${shapeCodes[mascot.shape]}${colorCodes[mascot.color]}`;
}

function decode(avatar: string | null | undefined): Mascot | null {
  const match = /^m:([a-z])([a-z])$/.exec((avatar ?? "").trim());
  if (!match) return null;
  const shape = mascotShapes.find((item) => shapeCodes[item] === match[1]);
  const color = mascotColors.find((item) => colorCodes[item] === match[2]);
  return shape && color ? { shape, color } : null;
}

export function isMascotCode(avatar: string | null | undefined) {
  return decode(avatar) !== null;
}

/** Hash FNV-1a de 32 bits: estable entre servidor y navegador. */
export function hashOf(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mascota fija para un agente sin elección: Vega para el principal; otra forma y color según su id. */
export function defaultMascot(agent: { id?: string; isDefault?: boolean; name?: string }): Mascot {
  if (agent.isDefault) return { shape: "vega", color: "violet" };
  const hash = hashOf(agent.id || agent.name || "agente");
  return {
    shape: pickableShapes[hash % pickableShapes.length],
    color: mascotColors[Math.floor(hash / pickableShapes.length) % mascotColors.length],
  };
}

export function mascotOf(agent: { id?: string; avatar?: string | null; isDefault?: boolean; name?: string } | undefined | null): Mascot {
  if (!agent) return { shape: "vega", color: "violet" };
  return decode(agent.avatar) ?? defaultMascot(agent);
}

/** Valida lo que llega del formulario: código de mascota válido o nada. */
export function cleanMascotCode(raw: unknown): string | null {
  return typeof raw === "string" && isMascotCode(raw) ? raw.trim() : null;
}
