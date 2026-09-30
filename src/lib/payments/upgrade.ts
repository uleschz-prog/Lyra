import { getPackage, isSignupPlanId } from "@/config/compensation-plan";

/**
 * Diferencia a pagar para subir de paquete: precio del destino menos lo ya pagado.
 * Si la cuenta no tiene un paquete de entrada activo, paga el precio completo del destino.
 * Devuelve `null` si el destino no es un paquete válido.
 */
export function upgradeDifferenceUsd(current: string | null | undefined, target: string): number | null {
  if (!isSignupPlanId(target)) return null;
  if (current && isSignupPlanId(current)) {
    const diff = getPackage(target).price - getPackage(current).price;
    return diff > 0 ? diff : 0;
  }
  return getPackage(target).price;
}

/** Paquetes a los que se puede subir, ordenados de menor a mayor precio. */
export function upgradePath(current: string | null | undefined): string | null {
  if (!current || !isSignupPlanId(current)) return null;
  return current;
}
