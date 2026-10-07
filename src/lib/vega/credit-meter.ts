/**
 * Porción pintada del círculo de créditos.
 * Con un saldo chico sigue el saldo real. Con un saldo grande, cada gasto se nota
 * y el círculo no se ve vacío mientras todavía queda más de una quinta parte.
 */
export function creditRingRatio(balance: number, tank: number) {
  if (!(balance > 0)) return 0;
  const safeTank = Math.max(tank, balance, 1);
  const real = Math.min(1, balance / safeTank);
  if (safeTank <= 400 || real <= 0.2) return real;
  const used = safeTank - balance;
  return Math.max(0.72, Math.min(real, 1 - used / 50));
}
