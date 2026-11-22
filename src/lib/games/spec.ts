// Modo juego: especificación (lo que planea el modelo), manifiesto del proyecto y archivos.
// Sin dependencias de servidor.
import { gameHtml, gameRuntimeSource, GAME_RUNTIME_VERSION } from "@/lib/games/runtime";

export const GAME_MANIFEST_PATH = "lyra.game.json";
export const GAME_CODE_PATH = "src/game.js";
export const GAME_RUNTIME_PATH = "src/lyra-game.js";

export const gameGenres = ["arcade", "plataformas", "puzzle", "trivia", "cartas", "runner", "3d-sencillo", "otro"] as const;
export type GameGenre = (typeof gameGenres)[number];

export type GameColors = { bg: string; primary: string; accent: string; text: string };

export type GameSpec = {
  genre: GameGenre;
  orientation: "portrait" | "landscape";
  width: number;
  height: number;
  /** Cómo se juega, para la pantalla de inicio. */
  howTo: string;
  touchHint: string;
  keysHint: string;
  /** Mecánicas concretas que el código debe tener (3–8). */
  mechanics: string[];
  /** Dirección de arte (formas, efectos, ambiente). */
  art: string;
  controls: { joystick: boolean; buttons: { id: string; label: string; keys: string[] }[]; tap: string | null };
  colors: GameColors;
  leaderboard: boolean;
  /** Cotas del ranking: puntaje máximo y puntos por segundo creíbles. */
  maxScore: number;
  maxPerSecond: number;
};

/** Manifiesto que guarda el proyecto (y lee el ranking del servidor). Solo datos públicos. */
export type GameManifest = {
  version: 1;
  runtime: number;
  title: string;
  genre: GameGenre;
  leaderboard: boolean;
  maxScore: number;
  maxPerSecond: number;
  colors: GameColors;
};

export const gameLimits = {
  maxCodeBytes: 70_000,
  minCodeBytes: 400,
  defaultMaxScore: 1_000_000,
  maxMaxScore: 100_000_000,
  defaultMaxPerSecond: 2_000,
};

export const lyraGameColors: GameColors = { bg: "#0B0718", primary: "#7C3AED", accent: "#22D3EE", text: "#EDE9FE" };

const hex = /^#[0-9a-f]{6}$/i;

function text(value: unknown, max: number, fallback = "") {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : fallback;
}

function int(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

function colorsOf(raw: unknown): GameColors {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const pickColor = (key: keyof GameColors) => (typeof input[key] === "string" && hex.test(input[key] as string) ? (input[key] as string) : lyraGameColors[key]);
  return { bg: pickColor("bg"), primary: pickColor("primary"), accent: pickColor("accent"), text: pickColor("text") };
}

const keyNames = new Set([" ", "enter", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift", "z", "x", "c", "j", "k", "l", "w", "a", "s", "d", "e", "q", "f"]);

function controlsOf(raw: unknown): GameSpec["controls"] {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const buttons = (Array.isArray(input.buttons) ? input.buttons : [])
    .slice(0, 3)
    .map((item, index) => {
      const button = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const id = text(button.id, 16).toLowerCase().replace(/[^a-z0-9_]/g, "") || `b${index}`;
      const keys = (Array.isArray(button.keys) ? button.keys : [])
        .map((key) => (key === " " ? " " : text(key, 12).toLowerCase()))
        .map((key) => (key === "space" || key === "espacio" ? " " : key))
        .filter((key) => keyNames.has(key))
        .slice(0, 3);
      return { id, label: text(button.label, 10) || id, keys };
    })
    .filter((button, index, all) => all.findIndex((other) => other.id === button.id) === index);
  const tap = text(input.tap, 16).toLowerCase();
  const tapId = tap.replace(/[^a-z0-9_]/g, "").slice(0, 16);
  return { joystick: input.joystick === true, buttons, tap: tapId || null };
}

/** Normaliza lo que propuso el modelo. Nunca falla: completa con valores seguros. */
export function normalizeGameSpec(raw: unknown, input: { leaderboard: boolean }): GameSpec {
  const spec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const genre = (gameGenres as readonly string[]).includes(String(spec.genre)) ? (spec.genre as GameGenre) : "arcade";
  const orientation = spec.orientation === "landscape" ? "landscape" : spec.orientation === "portrait" ? "portrait" : genre === "plataformas" || genre === "runner" ? "landscape" : "portrait";
  const width = int(spec.width, orientation === "portrait" ? 540 : 960, 320, 1600);
  const height = int(spec.height, orientation === "portrait" ? 960 : 540, 320, 1600);
  const mechanics = (Array.isArray(spec.mechanics) ? spec.mechanics : []).map((item) => text(item, 200)).filter(Boolean).slice(0, 8);
  const howTo = text(spec.howTo, 160) || "Consigue la mayor puntuación posible.";
  return {
    genre,
    orientation,
    width,
    height,
    howTo,
    touchHint: text(spec.touchHint, 120) || howTo,
    keysHint: text(spec.keysHint, 120) || "Flechas o WASD para moverte · Espacio para la acción · P para pausa.",
    mechanics: mechanics.length ? mechanics : ["Bucle de juego con dificultad que sube con el tiempo", "Puntuación visible y fin del juego claro"],
    art: text(spec.art, 400) || "Neón sobre fondo oscuro, formas geométricas con brillo y partículas.",
    controls: controlsOf(spec.controls),
    colors: colorsOf(spec.colors),
    leaderboard: input.leaderboard,
    maxScore: int(spec.maxScore, gameLimits.defaultMaxScore, 100, gameLimits.maxMaxScore),
    maxPerSecond: int(spec.maxPerSecond, gameLimits.defaultMaxPerSecond, 5, 1_000_000),
  };
}

export function gameManifest(title: string, spec: Pick<GameSpec, "genre" | "leaderboard" | "maxScore" | "maxPerSecond" | "colors">): GameManifest {
  return {
    version: 1,
    runtime: GAME_RUNTIME_VERSION,
    title: title.slice(0, 80),
    genre: spec.genre,
    leaderboard: spec.leaderboard,
    maxScore: spec.maxScore,
    maxPerSecond: spec.maxPerSecond,
    colors: spec.colors,
  };
}

/** Lee el manifiesto de los archivos de una versión (o null si no es un juego válido). */
export function gameManifestFromFiles(files: Record<string, string> | { path: string; content: string }[] | null | undefined): GameManifest | null {
  if (!files) return null;
  const content = Array.isArray(files) ? files.find((file) => file.path === GAME_MANIFEST_PATH)?.content : files[GAME_MANIFEST_PATH];
  if (typeof content !== "string") return null;
  try {
    const raw = JSON.parse(content) as Record<string, unknown>;
    if (!raw || typeof raw !== "object" || raw.version !== 1) return null;
    const genre = (gameGenres as readonly string[]).includes(String(raw.genre)) ? (raw.genre as GameGenre) : "otro";
    return {
      version: 1,
      runtime: int(raw.runtime, GAME_RUNTIME_VERSION, 1, 100),
      title: text(raw.title, 80) || "Juego",
      genre,
      leaderboard: raw.leaderboard === true,
      maxScore: int(raw.maxScore, gameLimits.defaultMaxScore, 100, gameLimits.maxMaxScore),
      maxPerSecond: int(raw.maxPerSecond, gameLimits.defaultMaxPerSecond, 5, 1_000_000),
      colors: colorsOf(raw.colors),
    };
  } catch {
    return null;
  }
}

/** ¿Los archivos son un proyecto del modo juego que el editor sabe cambiar? */
export function isGameProject(files: Record<string, string>) {
  return typeof files[GAME_CODE_PATH] === "string" && gameManifestFromFiles(files) !== null;
}

function readme(title: string, summary: string, manifest: GameManifest) {
  return `# ${title}

${summary}

Juego HTML5 hecho con el modo juego de Vega (LYRA). Todo va en \`index.html\`: el motor LyraGame y el código del juego, sin archivos externos.

## Archivos

- \`index.html\`: el juego listo para publicar (ábrelo en el navegador o súbelo a cualquier hosting estático).
- \`${GAME_CODE_PATH}\`: la lógica del juego (init, update y draw sobre LyraGame).
- \`${GAME_RUNTIME_PATH}\`: el motor (bucle de paso fijo, controles táctiles y de teclado, pausa, pantallas, sonido y ranking).
- \`${GAME_MANIFEST_PATH}\`: datos del juego para LYRA.

## Qué hace y qué no hace

- Funciona en celular y computadora: táctil y teclado. Se pausa solo si cambias de pestaña.
- Los sonidos se generan en código (WebAudio); no hay música ni imágenes externas.
- El récord se guarda en el navegador cuando el navegador lo permite; en la dirección pública de LYRA (/s/…) puede durar solo la sesión.
${manifest.leaderboard ? "- Ranking en línea (top 10) solo publicado en LYRA (/s/…). Tiene límites por persona y cotas de puntaje, pero no es a prueba de trampas.\n" : ""}- No incluye multijugador en tiempo real, compras dentro del juego ni versión para tiendas de apps.
`;
}

/** Archivos del proyecto de juego. `index.html` es el juego completo en un archivo. */
export function gameProjectFiles(input: { title: string; summary: string; code: string; manifest: GameManifest }): Record<string, string> {
  return {
    "index.html": gameHtml({ title: input.title, description: input.summary, bg: input.manifest.colors.bg, code: input.code }),
    [GAME_CODE_PATH]: input.code,
    [GAME_RUNTIME_PATH]: gameRuntimeSource,
    [GAME_MANIFEST_PATH]: `${JSON.stringify(input.manifest, null, 2)}\n`,
    "README.md": readme(input.title, input.summary, input.manifest),
  };
}
