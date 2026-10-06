import { describe, expect, it } from "vitest";

import { cronAuthorized, decideKeeper, isKeeperKey, keeperCallError } from "@/lib/protocol/keeper";

const ready = {
  hasExecutor: true,
  executorIsOwner: false,
  canExec: true,
  usdcBalance: BigInt(1_000_000_000),
  lastExecutionTime: BigInt(1_000),
  executionCooldown: BigInt(300),
  now: BigInt(2_000),
};

describe("decideKeeper", () => {
  it("ejecuta cuando el checker lo permite", () => {
    expect(decideKeeper(ready)).toEqual({ action: "execute" });
  });

  it("no llama si falta la llave", () => {
    expect(decideKeeper({ ...ready, hasExecutor: false })).toEqual({
      action: "skip",
      reason: "sin_ejecutor",
    });
  });

  it("rechaza la llave del owner", () => {
    expect(decideKeeper({ ...ready, executorIsOwner: true })).toEqual({
      action: "skip",
      reason: "es_owner",
    });
  });

  it("espera el cooldown sin gastar gas", () => {
    expect(decideKeeper({ ...ready, canExec: false, now: BigInt(1_100) })).toEqual({
      action: "skip",
      reason: "cooldown",
    });
  });

  it("no llama si el agente no tiene USDC", () => {
    expect(decideKeeper({ ...ready, canExec: false, usdcBalance: BigInt(0) })).toEqual({
      action: "skip",
      reason: "sin_saldo",
    });
  });

  it("salta cuando el precio no está fresco", () => {
    expect(decideKeeper({ ...ready, canExec: false })).toEqual({
      action: "skip",
      reason: "precio",
    });
  });
});

describe("cronAuthorized", () => {
  it("exige el bearer exacto", () => {
    expect(cronAuthorized("Bearer secreto", "secreto")).toBe(true);
    expect(cronAuthorized("Bearer otro", "secreto")).toBe(false);
    expect(cronAuthorized(null, "secreto")).toBe(false);
    expect(cronAuthorized("Bearer secreto", undefined)).toBe(false);
    expect(cronAuthorized("Bearer ", "")).toBe(false);
  });
});

describe("isKeeperKey", () => {
  it("acepta solo una llave de 32 bytes", () => {
    expect(isKeeperKey(`0x${"ab".repeat(32)}`)).toBe(true);
    expect(isKeeperKey(`  0x${"ab".repeat(32)}  `)).toBe(true);
    expect(isKeeperKey("0xabc")).toBe(false);
    expect(isKeeperKey(undefined)).toBe(false);
  });
});

describe("keeperCallError", () => {
  it("convierte un revert esperado en un skip", () => {
    expect(keeperCallError(new Error("Cooldown active")).status).toBe(200);
    expect(keeperCallError(new Error("No funds to operate")).body.skipped).toBe("sin_saldo");
    expect(keeperCallError(new Error("LyraAutonomousAgent: stale price")).body.skipped).toBe("precio");
  });

  it("avisa si no hay POL y no filtra el error crudo", () => {
    const result = keeperCallError(new Error("insufficient funds for gas * price + value"));
    expect(result.status).toBe(502);
    expect(result.body.error).toBe("La billetera ejecutora no tiene POL para el gas.");
    expect(JSON.stringify(result.body)).not.toContain("0x");
  });
});
