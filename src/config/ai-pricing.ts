/**
 * Precios de servidor. 1 crédito = 1 USD y el monto es entero.
 * El cliente no envía el precio: estas cifras y `constellationAgents.creditCost`
 * son la única fuente.
 *
 * Una vista previa (sin proveedor configurado, o el video local) no cobra.
 * Vega, más adelante: el chat incluido no usa estos precios; una acción de pago
 * debita con `reason` propio y puede anotar en `metadata` las acciones otorgadas.
 */
export const aiPricing = {
  builder: 1,
  notebook: 1,
  search: 1,
  speech: 1,
  video: 0,
  whatsapp: 1,
} as const;

export type AiPriceKey = keyof typeof aiPricing;
