// Revisión opcional (VEGA_IMAGE_TEXT_CHECK=on): un modelo barato de visión (nivel rápido) lee el texto
// de la imagen y se compara con el texto pedido. No regenera: solo avisa a Vega y al socio qué falta.
import { openVegaStream } from "@/lib/vega/model-gateway";
import { missingLines } from "@/lib/vega/images/prompt";

export type TextCheck = { ok: boolean; missing: string[]; read: string };

export async function readImageText(data: Uint8Array, mediaType: string, timeoutMs = 12_000): Promise<string | null> {
  const opened = await openVegaStream(
    "Transcribe exactamente todo el texto visible en la imagen, línea por línea, respetando acentos, ñ, signos y mayúsculas. No describas la imagen ni agregues nada más. Si no hay texto, responde (sin texto).",
    [{ role: "user", parts: [{ inlineData: { mimeType: mediaType, data: Buffer.from(data).toString("base64") } }, { text: "Transcribe el texto de esta imagen." }] }],
    [],
    { timeoutMs, tier: "rapido", label: "imagen:revisar-texto", generation: { maxOutputTokens: 600 } },
  );
  if (!opened.ok) return null;
  let text = "";
  for await (const part of opened.parts) if (part.text && !part.thought) text += part.text;
  return text.trim() || null;
}

export async function checkImageText(
  data: Uint8Array,
  mediaType: string,
  exactText: string,
  reader: typeof readImageText = readImageText,
): Promise<TextCheck | null> {
  const read = await reader(data, mediaType).catch(() => null);
  if (read === null) return null;
  const missing = missingLines(exactText, read);
  return { ok: missing.length === 0, missing, read: read.slice(0, 800) };
}
