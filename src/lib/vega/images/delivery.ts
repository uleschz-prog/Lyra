// Puente entre el turno de Vega y el generador de imágenes: resuelve referencias y arranca la generación.
import type { ImageDraft } from "@/lib/vega/images/tool";
import { imageSettings } from "@/lib/vega/images/config";
import { type ImageDeps, type ImageView, readImageFile, type ReferenceInput, startImageGeneration } from "@/lib/vega/images/runner";

/** Imagen adjunta en el mensaje actual (base64, como llega a Vega). */
export type TurnImageInput = { mimeType: string; data: string };

export function turnImageInputs(attachments: { inline?: { mimeType: string; data: string } }[] = []): TurnImageInput[] {
  return attachments.flatMap((item) => (item.inline && item.inline.mimeType.startsWith("image/") ? [item.inline] : []));
}

async function resolveReferences(
  userId: string,
  references: string[],
  inputs: TurnImageInput[],
  deps: ImageDeps,
): Promise<{ ok: true; items: ReferenceInput[] } | { ok: false; error: string }> {
  const items: ReferenceInput[] = [];
  for (const reference of references) {
    const [kind, value] = reference.split(":");
    if (kind === "adjunto") {
      const input = inputs[Number(value) - 1];
      if (!input) return { ok: false, error: `No encuentro la imagen ${reference} en este mensaje. Pide al socio que la adjunte de nuevo.` };
      items.push({ data: new Uint8Array(Buffer.from(input.data, "base64")), mediaType: input.mimeType });
    } else {
      const file = await readImageFile(deps.db, userId, value, deps.store).catch(() => null);
      if (!file) return { ok: false, error: `No encuentro la imagen ${reference} entre las que ya creaste.` };
      items.push({ data: file.data, mediaType: file.contentType });
    }
  }
  return { ok: true, items };
}

export type ImageDeliveryResult =
  | { ok: true; image: ImageView; duplicate: boolean; response: Record<string, unknown> }
  | { ok: false; message: string; response: Record<string, unknown> };

export async function startImageFromDelivery(
  input: { userId: string; chatId: string; actionId: string; draft: ImageDraft; inputs: TurnImageInput[] },
  deps: ImageDeps,
): Promise<ImageDeliveryResult> {
  const resolved = await resolveReferences(input.userId, input.draft.references, input.inputs, deps);
  if (!resolved.ok) return { ok: false, message: resolved.error, response: { estado: "no_se_pudo", error: resolved.error } };
  const started = await startImageGeneration(
    {
      user: { id: input.userId },
      conversationId: input.chatId,
      actionId: input.actionId,
      description: input.draft.description,
      exactText: input.draft.exactText,
      aspect: input.draft.aspectRatio,
      references: resolved.items,
    },
    deps,
  );
  if (!started.ok) return { ok: false, message: started.message, response: { estado: "no_se_pudo", error: started.message, nota: "Díselo al socio tal cual, en una frase. No se cobró la imagen." } };
  const price = imageSettings(deps.env ?? process.env).priceCredits;
  return {
    ok: true,
    image: started.image,
    duplicate: started.duplicate,
    response: {
      estado: "generando",
      imagen_id: started.image.id,
      nota: `El socio ve una tarjeta que genera la imagen (tarda de 20 a 60 segundos) y la muestra al terminar, con botón para descargar. Se cobraron ${price} crédito${price === 1 ? "" : "s"} (se devuelven si falla). No digas que ya está lista ni la describas como si la vieras.${input.draft.exactText ? " Recuérdale en una frase que revise que el texto salió letra por letra antes de publicarla." : ""} Para cambiarla después, vuelve a usar la herramienta con referencias ["imagen:${started.image.id}"].`,
    },
  };
}
