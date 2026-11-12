// Tipos y textos del medidor de costo de IA que también usa el cliente (sin Prisma).

export type CostTier = "inicio" | "negocio" | "pro";
export type CostLevel = "ok" | "warn" | "capped" | "unlimited";

/** Vista para el cliente: solo porcentaje y fechas (sin montos en dólares). */
export type CostMeterView = { level: CostLevel; pct: number; resetsAt: string; degraded: boolean; tier: CostTier | null };

export function meterLabel(view: CostMeterView) {
  const reset = new Date(view.resetsAt).toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: "America/Mexico_City" });
  if (view.level === "capped") return `Llegaste a tu límite mensual de uso de IA de Vega. Se renueva el ${reset}.`;
  const base = `Llevas el ${Math.floor(view.pct)} % de tu uso mensual de IA de Vega. Se renueva el ${reset}.`;
  return view.degraded ? `${base} Para cuidar tu límite, Vega usa un modelo más ligero.` : base;
}
