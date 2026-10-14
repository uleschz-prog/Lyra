import { getPackage } from "@/config/compensation-plan";

/**
 * Founder usa la mensualidad de $29.
 * Corporate no tiene mensualidad. Usar 0 apagaría Vega en un plan que sí tiene acceso,
 * así que la base del mes es el precio del plan. La exención de recompra no baja el tope:
 * el límite sigue el precio de lista, no lo que la cuenta pagó ese mes.
 */
export function monthlyReferenceUsd(packageId: string | null | undefined): number {
  if (packageId !== "FOUNDER" && packageId !== "CORPORATE") return 0;
  const plan = getPackage(packageId);
  return plan.rebuy > 0 ? plan.rebuy : plan.price;
}

export function readBudgetRatio(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") return 0.05;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("LLM_BUDGET_RATIO debe ser un número entre 0 y 1.");
  }
  return value;
}

export function monthlyLlmBudgetUsd(
  packageId: string | null | undefined,
  ratio: number,
  override?: number | null,
): number {
  const effective = override == null || !Number.isFinite(override) ? ratio : override;
  const clamped = Math.min(1, Math.max(0, effective));
  return monthlyReferenceUsd(packageId) * clamped;
}
