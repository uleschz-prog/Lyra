/** Vega, el superagente, no es el paquete de compensación que también se llama VEGA. */
export function canUseVega(packageId: string | null | undefined): boolean {
  return packageId === "FOUNDER" || packageId === "CORPORATE";
}
