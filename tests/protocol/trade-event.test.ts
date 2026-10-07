import { describe, expect, it } from "vitest";

import { formatEthUsd, tradeExecutedMessage } from "@/lib/protocol/trade-event";

describe("StrategyExecuted", () => {
  it("arma el aviso con el profit del evento", () => {
    expect(tradeExecutedMessage(BigInt(1_000_000))).toBe("Trade ejecutado: Ganancia de 1.00 USDC");
  });

  it("formatea el precio ETH/USD de Chainlink", () => {
    expect(formatEthUsd(BigInt(269436000000), 8)).toBe("2,694.36 USD");
    expect(formatEthUsd(BigInt(0), 8)).toBeNull();
  });
});
