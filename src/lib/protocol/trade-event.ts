import { formatUnits } from "viem";

export function formatUsdc(amount: bigint) {
  const value = Number(formatUnits(amount, 6));
  return `${new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} USDC`;
}

/** `profit` es el USDC que el intercambio dejó por encima de Chainlink. */
export function tradeExecutedMessage(profit: bigint) {
  return `Trade ejecutado: Ganancia de ${formatUsdc(profit)}`;
}

export function formatWeth(amount: bigint) {
  const value = Number(formatUnits(amount, 18));
  return `${new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value)} WETH`;
}

export function formatEthUsd(price: bigint, decimals: number) {
  if (price <= BigInt(0) || decimals < 0) return null;
  const value = Number(formatUnits(price, decimals));
  if (!Number.isFinite(value)) return null;
  return `${new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} USD`;
}
