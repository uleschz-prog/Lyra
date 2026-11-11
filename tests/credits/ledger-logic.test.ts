import { describe, expect, it } from "vitest";

import { canonicalBalance, commitLedger, createSerialLedger, planLedgerOp } from "@/lib/credits/ledger-logic";

describe("canonicalBalance", () => {
  it("usa el mayor entre User.credits y CreditWallet.balance", () => {
    expect(canonicalBalance(10, 7)).toBe(10);
    expect(canonicalBalance(7, 10)).toBe(10);
    expect(canonicalBalance(5, null)).toBe(5);
    expect(canonicalBalance(5, undefined)).toBe(5);
  });
});

describe("planLedgerOp", () => {
  it("repite un movimiento si el externalRef ya existe", () => {
    expect(planLedgerOp({ userCredits: 10, walletBalance: 10, delta: -3, hasExistingRef: true })).toEqual({
      action: "replay",
      balance: 10,
    });
  });

  it("rechaza un débito que dejaría el saldo negativo", () => {
    expect(planLedgerOp({ userCredits: 2, walletBalance: 2, delta: -5, hasExistingRef: false })).toEqual({
      action: "reject",
      code: "insufficient",
      balance: 2,
    });
  });

  it("rechaza un delta no entero o cero", () => {
    expect(planLedgerOp({ userCredits: 10, walletBalance: 10, delta: 0, hasExistingRef: false }).action).toBe("reject");
    expect(planLedgerOp({ userCredits: 10, walletBalance: 10, delta: 1.5, hasExistingRef: false }).action).toBe("reject");
  });

  it("aplica un abono y un débito válido", () => {
    expect(planLedgerOp({ userCredits: 10, walletBalance: 8, delta: 5, hasExistingRef: false })).toEqual({
      action: "apply",
      balance: 15,
    });
    expect(planLedgerOp({ userCredits: 10, walletBalance: 10, delta: -4, hasExistingRef: false })).toEqual({
      action: "apply",
      balance: 6,
    });
  });
});

describe("commitLedger", () => {
  it("serializa dos débitos sobre el mismo saldo", () => {
    const first = commitLedger(
      { userCredits: 5, walletBalance: 5, entries: [] },
      { id: "a", delta: -3, externalRef: "spend:1" },
    );
    expect(first.plan).toEqual({ action: "apply", balance: 2 });
    const second = commitLedger(first.state, { id: "b", delta: -3, externalRef: "spend:2" });
    expect(second.plan).toEqual({ action: "reject", code: "insufficient", balance: 2 });
  });

  it("no vuelve a mover el saldo si el externalRef se repite", () => {
    const first = commitLedger(
      { userCredits: 10, walletBalance: 10, entries: [] },
      { id: "a", delta: -4, externalRef: "spend:same" },
    );
    const second = commitLedger(first.state, { id: "b", delta: -4, externalRef: "spend:same" });
    expect(second.already).toBe(true);
    expect(second.state.userCredits).toBe(6);
    expect(second.state.entries).toHaveLength(1);
  });
});

describe("createSerialLedger", () => {
  it("encola operaciones para que la segunda vea el saldo ya movido", async () => {
    const ledger = createSerialLedger({ userCredits: 5, walletBalance: 5, entries: [] });
    const [first, second] = await Promise.all([
      ledger.apply({ id: "a", delta: -3, externalRef: "one" }),
      ledger.apply({ id: "b", delta: -3, externalRef: "two" }),
    ]);
    expect(first.plan.action).toBe("apply");
    expect(second.plan).toEqual({ action: "reject", code: "insufficient", balance: 2 });
  });
});
