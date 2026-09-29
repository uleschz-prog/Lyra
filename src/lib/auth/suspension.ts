export const INDEFINITE_YEAR = 2100;

export function isSuspended(until: Date | null | undefined, now = new Date()) {
  return Boolean(until && until.getTime() > now.getTime());
}

export function suspensionMessage(until: Date) {
  if (until.getUTCFullYear() >= INDEFINITE_YEAR) {
    return "Tu cuenta está suspendida. Escríbenos a soporte para reactivarla.";
  }
  const date = until.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Mexico_City" });
  return `Tu cuenta está suspendida hasta el ${date}.`;
}
