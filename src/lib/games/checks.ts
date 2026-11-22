// Revisión del código de juego que escribe el modelo. En el servidor NO se ejecuta (un vm de
// Node no es una frontera de seguridad): solo sintaxis con esbuild y reglas estáticas. El juego
// corre después en el navegador con CSP «sandbox» (sin red salvo el ranking de LYRA).
import { findSecret } from "@/lib/vega/secret-filter";
import { gameLimits } from "@/lib/games/spec";

const forbidden: { pattern: RegExp; message: string }[] = [
  { pattern: /^\s*import\s|^\s*export\s|\bimport\s*\(/m, message: "No uses import/export: el juego es un solo script que llama LyraGame.start." },
  { pattern: /\brequire\s*\(/, message: "No uses require." },
  { pattern: /\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b|\bEventSource\b|sendBeacon|RTCPeerConnection/, message: "Sin red: el ranking lo maneja LyraGame (leaderboard: true)." },
  { pattern: /\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(|setTimeout\s*\(\s*["']|setInterval\s*\(\s*["']/, message: "No uses eval, Function ni temporizadores con texto." },
  { pattern: /localStorage|sessionStorage|indexedDB|document\.cookie/, message: "No uses almacenamiento del navegador: LyraGame guarda el récord." },
  { pattern: /\bnew\s+Worker\b|importScripts|serviceWorker/, message: "No uses workers." },
  { pattern: /window\.open|\btop\.location|\bparent\.|postMessage|location\.href\s*=/, message: "No abras ventanas ni navegues fuera del juego." },
  { pattern: /requestAnimationFrame|setInterval\s*\(/, message: "No hagas tu propio bucle: LyraGame llama update y draw a paso fijo." },
  { pattern: /<\s*script|<\s*\/\s*script/i, message: "No escribas etiquetas <script>." },
  { pattern: /\bnew\s+(?:Audio|Image)\s*\(|\.mp3\b|\.ogg\b|\.wav\b|\.png\b|\.jpe?g\b|\.gif\b|\.webp\b/, message: "Sin archivos externos: dibuja con canvas y usa g.sfx / g.tone para el sonido." },
];

const urlPattern = /\b(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/i;

/** Quita comentarios y textos para que las reglas no salten por un comentario. */
function codeOnly(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:\\])\/\/[^\n]*/g, "$1 ");
}

export function checkGameCode(source: string): string[] {
  const errors: string[] = [];
  const bytes = Buffer.byteLength(source, "utf8");
  if (bytes < gameLimits.minCodeBytes) errors.push("El juego está incompleto (muy corto).");
  if (bytes > gameLimits.maxCodeBytes) errors.push(`El juego pesa demasiado (${Math.round(bytes / 1000)} KB; máximo ${Math.round(gameLimits.maxCodeBytes / 1000)} KB).`);
  const code = codeOnly(source);
  if (!/LyraGame\.start\s*\(/.test(code)) errors.push("Falta LyraGame.start({...}).");
  for (const name of ["init", "update", "draw"]) {
    if (!new RegExp(`\\b${name}\\s*(?::|\\()`).test(code)) errors.push(`Falta la función ${name} en la configuración de LyraGame.start.`);
  }
  for (const rule of forbidden) if (rule.pattern.test(code)) errors.push(rule.message);
  if (urlPattern.test(code)) errors.push("Sin direcciones externas (http/https): todo se dibuja en el juego.");
  if (findSecret(source)) errors.push("El código parece contener una llave o dato sensible; quítalo.");
  return [...new Set(errors)];
}

/** Sintaxis con esbuild (sin ejecutar). */
export async function syntaxErrors(source: string): Promise<string[]> {
  const { transform } = await import("esbuild");
  try {
    await transform(source, { loader: "js", format: "iife", target: "es2018", logLevel: "silent" });
    return [];
  } catch (error) {
    const messages = (error as { errors?: { text: string; location?: { line?: number; lineText?: string } | null }[] }).errors ?? [];
    if (!messages.length) return ["El código no compila."];
    return messages.slice(0, 6).map((message) => `${message.text}${message.location?.line ? ` (línea ${message.location.line}: ${(message.location.lineText ?? "").trim().slice(0, 120)})` : ""}`);
  }
}

/** Extrae el JS de la respuesta del modelo (bloque ```js o el texto completo). */
export function extractGameCode(text: string) {
  const fenced = [...text.matchAll(/```(?:js|javascript|jsx)?\s*\n([\s\S]*?)```/g)].map((match) => match[1]);
  const code = fenced.sort((a, b) => b.length - a.length)[0] ?? text;
  return code.trim() + "\n";
}

export async function validateGameCode(source: string) {
  const errors = checkGameCode(source);
  if (errors.length) return errors;
  return syntaxErrors(source);
}
