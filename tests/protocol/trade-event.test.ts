import { describe, expect, it } from "vitest";

import { balanceAfterTrades, tradeExecutedMessage, tradeGain } from "@/lib/protocol/trade-event";

describe("StrategyExecuted", () => {
  it("calcula la ganancia como amountOut menos amountIn", () => {
    expect(tradeGain(BigInt(1_000_000_000), BigInt(1_100_000_000))).toBe(BigInt(100_000_000));
    expect(tradeGain(BigInt(1_100_000_000), BigInt(1_000_000_000))).toBe(BigInt(0));
  });

  it("suma la ganancia al saldo y arma el aviso", () => {
    const trades = [{ amountIn: BigInt(1_100_000_000), amountOut: BigInt(1_210_000_000) }];
    expect(balanceAfterTrades(BigInt(1_100_000_000), trades)).toBe(BigInt(1_210_000_000));
    expect(tradeExecutedMessage(BigInt(1_100_000_000), BigInt(1_210_000_000))).toBe("Trade ejecutado: Ganancia de 110.00 USDC");
  });
});
