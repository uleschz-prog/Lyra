// Prompt para el modelo de imagen: descripción visual + texto literal en español, entre comillas.
import type { AspectRatio } from "@/lib/vega/images/config";

const formatHints: Record<AspectRatio, string> = {
  "1:1": "Formato cuadrado (post de Instagram o Facebook).",
  "2:3": "Formato vertical (flyer, cartel o historia).",
  "3:2": "Formato horizontal (portada, banner o presentación).",
};

export const MAX_DESCRIPTION = 1500;
export const MAX_EXACT_TEXT = 400;

/** Separa el texto en líneas (cada línea se pide tal cual). */
export function textLines(exact: string) {
  return exact
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 12);
}

/**
 * Las comillas rectas dentro del texto se cambian por «» para no romper el entrecomillado.
 * El resto (acentos, ñ, ¿ ¡, $, signos) se conserva carácter por carácter.
 */
function quoted(line: string) {
  return `"${line.replace(/"/g, "”")}"`;
}

export function buildImagePrompt(input: { description: string; exactText?: string; aspect: AspectRatio }) {
  const lines = input.exactText ? textLines(input.exactText) : [];
  const parts = [input.description.trim(), formatHints[input.aspect]];
  if (lines.length) {
    parts.push(
      [
        "La imagen debe mostrar EXACTAMENTE este texto en español, copiado letra por letra, con todos sus acentos (á é í ó ú), la ñ y los signos ¿ ¡:",
        ...lines.map((line, index) => `${index + 1}. ${quoted(line)}`),
        "Reglas del texto: escríbelo tal cual (sin traducir, sin corregir, sin abreviar y sin agregar palabras), en este orden, con tipografía grande, nítida y legible, y buen contraste con el fondo. No agregues ningún otro texto, logotipo ni marca de agua.",
      ].join("\n"),
    );
  } else {
    parts.push("No incluyas texto, letras ni logotipos en la imagen salvo que la descripción lo pida.");
  }
  return parts.join("\n\n");
}

/** Normaliza para comparar lo que se pidió con lo que se leyó (no ignora acentos ni la ñ). */
export function normalizeForCheck(text: string) {
  return text
    .normalize("NFC")
    .toLocaleLowerCase("es")
    .replace(/[“”"«»'’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Líneas pedidas que no aparecen en el texto leído (con acentos). */
export function missingLines(exactText: string, readText: string) {
  const haystack = normalizeForCheck(readText);
  return textLines(exactText).filter((line) => !haystack.includes(normalizeForCheck(line)));
}
