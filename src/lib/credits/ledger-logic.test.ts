import assert from "node:assert/strict";
import test from "node:test";

import { canonicalBalance, commitLedger, createSerialLedger, planLedgerOp, type MemoryLedger } from "./ledger-logic";

function empty(userCredits: number, walletBalance: number | null = userCredits): MemoryLedger {
  return { userCredits, walletBalance, entries: [] };
}

test("el saldo canónico conserva el mayor de las dos columnas", () => {
  assert.equal(canonicalBalance(40, 10), 40);
  assert.equal(canonicalBalance(10, 40), 40);
  assert.equal(canonicalBalance(15, null), 15);
  assert.equal(canonicalBalance(0, 0), 0);
});

test("un débito usa el saldo reconciliado y deja las dos columnas iguales", () => {
  const result = commitLedger(empty(10, 40), { id: "d1", delta: -15, externalRef: "ai:1" });
  assert.equal(result.plan.action, "apply");
  assert.equal(result.state.userCredits, 25);
  assert.equal(result.state.walletBalance, 25);
  assert.equal(result.state.entries.length, 1);
  assert.equal(result.state.entries[0]?.creditDelta, -15);
});

test("saldo insuficiente no escribe un movimiento y devuelve el saldo reconciliado", () => {
  const result = commitLedger(empty(5, 8), { id: "d1", delta: -9, externalRef: "ai:1" });
  assert.deepEqual(result.plan, { action: "reject", code: "insufficient", balance: 8 });
  assert.equal(result.state.entries.length, 0);
  assert.equal(result.state.userCredits, 8);
  assert.equal(result.state.walletBalance, 8);
});

test("la misma externalRef no debita dos veces", () => {
  const once = commitLedger(empty(100), { id: "d1", delta: -30, externalRef: "ai:agent:u:key" });
  const twice = commitLedger(once.state, { id: "d2", delta: -30, externalRef: "ai:agent:u:key" });
  assert.equal(twice.already, true);
  assert.equal(twice.plan.action, "replay");
  assert.equal(twice.state.userCredits, 70);
  assert.equal(twice.state.entries.length, 1);
});

test("un reembolso con otra clave devuelve el saldo y también es idempotente", () => {
  const spent = commitLedger(empty(100), { id: "d1", delta: -30, externalRef: "ai:speech:u:key" });
  const refund = commitLedger(spent.state, { id: "r1", delta: 30, externalRef: "ai:speech:u:key:refund" });
  const again = commitLedger(refund.state, { id: "r2", delta: 30, externalRef: "ai:speech:u:key:refund" });
  assert.equal(refund.state.userCredits, 100);
  assert.equal(again.already, true);
  assert.equal(again.state.userCredits, 100);
  assert.equal(again.state.entries.length, 2);
});

test("dos débitos concurrentes se serializan: el segundo ve el saldo ya descontado", async () => {
  const ledger = createSerialLedger(empty(100));
  const [first, second] = await Promise.all([
    ledger.apply({ id: "a", delta: -60, externalRef: "one" }),
    ledger.apply({ id: "b", delta: -60, externalRef: "two" }),
  ]);
  const applied = [first, second].filter((item) => item.plan.action === "apply");
  const rejected = [first, second].filter((item) => item.plan.action === "reject");
  assert.equal(applied.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0]?.plan.balance, 40);
  assert.equal(ledger.snapshot().userCredits, 40);
  assert.equal(ledger.snapshot().walletBalance, 40);
  assert.equal(ledger.snapshot().entries.length, 1);
});

test("dos cobros concurrentes con la misma clave solo descuentan una vez", async () => {
  const ledger = createSerialLedger(empty(50));
  const [first, second] = await Promise.all([
    ledger.apply({ id: "a", delta: -20, externalRef: "same" }),
    ledger.apply({ id: "b", delta: -20, externalRef: "same" }),
  ]);
  assert.equal(first.already || second.already, true);
  assert.equal(ledger.snapshot().userCredits, 30);
  assert.equal(ledger.snapshot().entries.length, 1);
});

test("un delta que no es entero se rechaza", () => {
  const plan = planLedgerOp({ userCredits: 10, walletBalance: 10, delta: 1.5, hasExistingRef: false });
  assert.deepEqual(plan, { action: "reject", code: "invalid", balance: 10 });
});
