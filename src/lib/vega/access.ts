import type { AuthProfile } from "@/lib/types";

/** Planes que abren al superagente. El paquete de compensación VEGA no entra aquí. */
export const vegaPlans = ["FOUNDER", "CORPORATE"] as const;

type VegaSubject = Pick<AuthProfile, "role" | "package"> | string | null | undefined;

/**
 * Acepta el paquete suelto o el usuario completo.
 * Un admin entra aunque su paquete no sea Founder o Corporate.
 */
export function canUseVega(subject: VegaSubject): boolean {
  if (!subject) return false;
  if (typeof subject === "string") return (vegaPlans as readonly string[]).includes(subject);
  return subject.role === "ADMIN" || (vegaPlans as readonly string[]).includes(subject.package);
}
