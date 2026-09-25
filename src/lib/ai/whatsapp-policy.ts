/**
 * La cuenta de Composio es compartida (`user_id` fijo "lyra"). Hasta que cada
 * socio conecte la suya, el envío queda apagado salvo que el operador lo
 * habilite y la sesión sea de administración.
 */
export function whatsappSendPolicy(role: string | null | undefined, flag: string | undefined) {
  if (flag !== "true") return { allowed: false as const, reason: "disabled" as const };
  if (role !== "ADMIN") return { allowed: false as const, reason: "admin" as const };
  return { allowed: true as const, reason: "ok" as const };
}

export const whatsappDisabledMessage =
  "El envío por WhatsApp está desactivado hasta que cada cuenta conecte la suya. El borrador queda en el estudio.";
