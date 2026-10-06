import { formatUnits } from "viem";

export function formatUsdc(amount: bigint) {
  const value = Number(formatUnits(amount, 6));
  return `${new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} USDC`;
}

/** Ganancia del swap simulado. El evento no trae `profit`: es amountOut − amountIn. */
export function tradeGain(amountIn: bigint, amountOut: bigint) {
  return amountOut > amountIn ? amountOut - amountIn : BigInt(0);
}

export function sumTradeGain(trades: { amountIn: bigint; amountOut: bigint }[]) {
  return trades.reduce((total, trade) => total + tradeGain(trade.amountIn, trade.amountOut), BigInt(0));
}

export function tradeExecutedMessage(amountIn: bigint, amountOut: bigint) {
  return `Trade ejecutado: Ganancia de ${formatUsdc(tradeGain(amountIn, amountOut))}`;
}

export function balanceAfterTrades(balance: bigint, trades: { amountIn: bigint; amountOut: bigint }[]) {
  return balance + sumTradeGain(trades);
}
