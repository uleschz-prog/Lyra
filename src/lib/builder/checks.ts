// Revisiones estáticas de los archivos que escribe el modelo: imports permitidos, patrones
// prohibidos, dominios externos y secretos. El andamiaje es de confianza y no pasa por aquí.
import { builderLimits } from "@/lib/builder/config";
import { findSecret } from "@/lib/vega/secret-filter";

export const allowedPackages = new Set(["react", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "lucide-react"]);

/** Dominios que el código generado puede mencionar (fuentes, imágenes y enlaces de contacto). */
export const allowedHosts = new Set([
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "images.unsplash.com",
  "wa.me",
  "api.whatsapp.com",
  "maps.google.com",
  "www.instagram.com",
  "instagram.com",
  "www.facebook.com",
  "facebook.com",
  "www.tiktok.com",
  "tiktok.com",
  "x.com",
  "www.linkedin.com",
  "linkedin.com",
  "www.youtube.com",
  "youtube.com",
]);

const forbidden: { pattern: RegExp; message: string }[] = [
  { pattern: /\bfetch\s*\(/, message: "No uses fetch: los datos van por ../lib/data o en el propio archivo." },
  { pattern: /\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|sendBeacon/, message: "No hagas peticiones de red." },
  { pattern: /\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(/, message: "No uses eval ni Function." },
  { pattern: /dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|document\.write/, message: "No inyectes HTML crudo." },
  { pattern: /document\.cookie|\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/, message: "No uses almacenamiento del navegador directo; usa ../lib/data." },
  { pattern: /\bimport\s*\(/, message: "No uses import() dinámico." },
  { pattern: /window\.(top|parent|opener)\b|\bpostMessage\s*\(/, message: "No accedas a otras ventanas." },
  { pattern: /<script\b|<iframe\b|<object\b|<embed\b/i, message: "No insertes script, iframe, object ni embed." },
  { pattern: /\brequire\s*\(|\bprocess\.env\b/, message: "No uses require ni process.env." },
];

const tokenPatterns = [
  /\bAIza[0-9A-Za-z_-]{30,}/,
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
];

export function importsOf(source: string) {
  const found: string[] = [];
  const pattern = /(?:^|\n)\s*(?:import|export)\s[^;'"]*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) found.push(match[1] ?? match[2]);
  return found;
}

/** Errores de un archivo generado (vacío = pasa). */
export function checkGeneratedFile(path: string, source: string, componentName?: string): string[] {
  const errors: string[] = [];
  if (Buffer.byteLength(source, "utf8") > builderLimits.maxFileBytes) errors.push("El archivo es demasiado grande; simplifícalo.");
  if (!/export\s+default\s+(?:function|class)\s+[A-Z]/.test(source)) errors.push(`Debe exportar por defecto un componente${componentName ? ` llamado ${componentName}` : ""}: export default function ${componentName ?? "Nombre"}() { … }.`);
  for (const spec of importsOf(source)) {
    if (spec.startsWith(".")) continue;
    if (!allowedPackages.has(spec)) errors.push(`Import no permitido: "${spec}". Solo react, lucide-react y archivos relativos (../lib/router, ../lib/data, ../lib/format, ../data/stores).`);
  }
  for (const rule of forbidden) if (rule.pattern.test(source)) errors.push(rule.message);
  for (const match of source.matchAll(/(?:https?:)?\/\/([a-z0-9.-]+\.[a-z]{2,})(?=[/:"'`\s?#)]|$)/gi)) {
    const host = match[1].toLowerCase();
    if (!allowedHosts.has(host)) errors.push(`Dominio externo no permitido: ${host}. Quita la URL o usa un degradado/ícono.`);
  }
  if (findSecret(source) || tokenPatterns.some((pattern) => pattern.test(source))) errors.push("El archivo parece contener una llave o dato sensible; quítalo.");
  return [...new Set(errors)].map((error) => `${path}: ${error}`);
}

/** Extrae el código de una respuesta del modelo (bloque ```tsx o el texto completo). */
export function extractCode(text: string) {
  const fenced = [...text.matchAll(/```(?:tsx|ts|jsx|js|typescript|javascript)?\s*\n([\s\S]*?)```/g)].map((match) => match[1]);
  const code = fenced.sort((a, b) => b.length - a.length)[0] ?? text;
  return code.trim() + "\n";
}
