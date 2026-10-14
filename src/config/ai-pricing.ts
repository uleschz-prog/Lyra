import { creditPrices } from "@/lib/credits";

/**
 * Precios de servidor para las rutas HTTP de IA. 1 crédito = 1 USD, entero.
 * El cliente no envía el precio.
 *
 * Notebook, búsqueda y voz usan las cifras de sync-local (más altas que el 1
 * provisional de la Fase 0). El video local no cobra. Una vista previa, cuando
 * falta la clave del proveedor, tampoco.
 */
export const aiPricing = {
  notebook: creditPrices.notebook,
  search: creditPrices.search,
  speech: creditPrices.speech,
  video: 0,
} as const;

export type AiPriceKey = keyof typeof aiPricing;
