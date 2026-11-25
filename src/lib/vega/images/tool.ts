// Herramienta de Vega «generar_imagen»: declaración y validación de argumentos.
import type { FunctionDeclaration } from "@/lib/vega/gemini-stream";
import { type AspectRatio, aspectRatios, imageSettings, MAX_REFERENCES } from "@/lib/vega/images/config";
import { MAX_DESCRIPTION, MAX_EXACT_TEXT } from "@/lib/vega/images/prompt";

export const imageToolName = "generar_imagen";

/** Lo que guarda la entrega (VegaAction.payload) antes de generar. */
export type ImageDraft = {
  description: string;
  exactText?: string;
  aspectRatio: AspectRatio;
  /** «adjunto:N» (imagen N del mensaje actual) o «imagen:ID» (una imagen que Vega ya creó). */
  references: string[];
};

export function imageToolDeclaration(env: Record<string, string | undefined> = process.env): FunctionDeclaration {
  const price = imageSettings(env).priceCredits;
  return {
    name: imageToolName,
    description: `Crea una imagen (flyer, post para redes, invitación, cartel o portada) y la muestra en el chat. Cuesta ${price} crédito${price === 1 ? "" : "s"} por imagen (se devuelven si falla) y tarda de 20 a 60 segundos. Si la imagen lleva texto (títulos, precios, fechas, teléfono), pásalo COMPLETO y literal en texto_exacto, tal como lo dijo el socio, en español con acentos y ñ; no inventes datos (precio, fecha, dirección o teléfono): si faltan y el socio los quiere, pregúntalos antes. Para cambiar una imagen que ya creaste o usar un logo o foto que el socio adjuntó, usa referencias. No la uses para videos (todavía no están disponibles).`,
    parameters: {
      type: "object",
      properties: {
        descripcion: {
          type: "string",
          description: "Descripción visual concreta: tema, estilo, colores, composición, fotos o ilustración. En español. Sin el texto literal (ese va en texto_exacto).",
        },
        texto_exacto: {
          type: "string",
          description: "Texto que debe aparecer en la imagen, letra por letra, una línea por renglón (p. ej. «GRAN APERTURA\\nSábado 6 de diciembre · 10:00\\n2x1 en cafés»). Vacío si la imagen no lleva texto.",
        },
        formato: {
          type: "string",
          enum: aspectRatios,
          description: "1:1 = post cuadrado (Instagram/Facebook); 2:3 = vertical (flyer, cartel, historia); 3:2 = horizontal (portada, banner).",
        },
        referencias: {
          type: "array",
          items: { type: "string" },
          description: `Opcional, hasta ${MAX_REFERENCES}: «adjunto:1» para la primera imagen que el socio adjuntó en este mensaje, o «imagen:ID» para una imagen que ya creaste (el ID viene en su resultado).`,
        },
      },
      required: ["descripcion", "formato"],
    },
  };
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, max) : "";
}

export function parseImageArgs(args: Record<string, unknown>): { ok: true; draft: ImageDraft } | { ok: false; error: string } {
  const description = clean(args.descripcion, MAX_DESCRIPTION);
  if (description.length < 8) return { ok: false, error: "Describe la imagen con un poco más de detalle (tema, estilo y colores)." };
  const exactText = clean(args.texto_exacto, MAX_EXACT_TEXT + 1);
  if (exactText.length > MAX_EXACT_TEXT) return { ok: false, error: `El texto de la imagen es muy largo (máximo ${MAX_EXACT_TEXT} caracteres). Resúmelo con el socio.` };
  const format = clean(args.formato, 8);
  const aspectRatio = (aspectRatios as string[]).includes(format) ? (format as AspectRatio) : "1:1";
  const raw = Array.isArray(args.referencias) ? args.referencias : [];
  const references = raw
    .map((item) => clean(item, 60))
    .filter((item) => /^adjunto:[1-9]$/.test(item) || /^imagen:[a-z0-9]{10,40}$/i.test(item));
  if (raw.length > MAX_REFERENCES || references.length < raw.length) {
    return { ok: false, error: `Referencias no válidas: usa «adjunto:N» o «imagen:ID», máximo ${MAX_REFERENCES}.` };
  }
  return { ok: true, draft: { description, ...(exactText ? { exactText } : {}), aspectRatio, references: [...new Set(references)] } };
}
