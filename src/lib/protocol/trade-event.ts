import { formatUnits } from "viem";

export function formatUsdc(amount: bigint) {
  const value = Number(formatUnits(amount, 6));
  return `${new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} USDC`;
}

/** El evento trae `profit`: la ganancia simulada del 0.1 %. No mueve el saldo USDC. */
export function tradeExecutedMessage(profit: bigint) {
  return `Trade ejecutado: Ganancia de ${formatUsdc(profit)}`;
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
