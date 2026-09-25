/**
 * Reglas del libro de créditos. El saldo canónico es el mayor entre
 * `User.credits` y `CreditWallet.balance`, para no perder un saldo que solo
 * estuviera en una de las dos columnas. El adaptador de base de datos aplica
 * este plan dentro de una transacción con `SELECT … FOR UPDATE`.
 *
 * Fase Vega (no implementada): un débito con `reason` `vega.action_bag` y
 * `metadata.actionsGranted` podrá sumar acciones a un contador aparte. El chat
 * incluido no pasa por aquí; las acciones de pago sí.
 */

export function canonicalBalance(userCredits: number, walletBalance: number | null | undefined) {
  const user = Number.isInteger(userCredits) ? userCredits : 0;
  if (walletBalance == null) return user;
  const wallet = Number.isInteger(walletBalance) ? walletBalance : 0;
  return Math.max(user, wallet);
}

export type LedgerPlan =
  | { action: "replay"; balance: number }
  | { action: "reject"; code: "insufficient" | "invalid"; balance: number }
  | { action: "apply"; balance: number };

export function planLedgerOp(input: {
  userCredits: number;
  walletBalance: number | null | undefined;
  delta: number;
  hasExistingRef: boolean;
}): LedgerPlan {
  const current = canonicalBalance(input.userCredits, input.walletBalance);
  if (input.hasExistingRef) return { action: "replay", balance: current };
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    return { action: "reject", code: "invalid", balance: current };
  }
  const next = current + input.delta;
  if (next < 0) return { action: "reject", code: "insufficient", balance: current };
  return { action: "apply", balance: next };
}

export type MemoryEntry = {
  id: string;
  externalRef: string | null;
  creditDelta: number;
};

export type MemoryLedger = {
  userCredits: number;
  walletBalance: number | null;
  entries: MemoryEntry[];
};

export function commitLedger(
  state: MemoryLedger,
  input: { id: string; delta: number; externalRef?: string | null },
): { state: MemoryLedger; plan: LedgerPlan; already: boolean } {
  const externalRef = input.externalRef ?? null;
  const hasExistingRef = externalRef !== null && state.entries.some((entry) => entry.externalRef === externalRef);
  const plan = planLedgerOp({
    userCredits: state.userCredits,
    walletBalance: state.walletBalance,
    delta: input.delta,
    hasExistingRef,
  });

  if (plan.action !== "apply") {
    return {
      state: { ...state, userCredits: plan.balance, walletBalance: plan.balance },
      plan,
      already: plan.action === "replay",
    };
  }

  return {
    state: {
      userCredits: plan.balance,
      walletBalance: plan.balance,
      entries: [...state.entries, { id: input.id, externalRef, creditDelta: input.delta }],
    },
    plan,
    already: false,
  };
}

/** Cola con el mismo orden que un `FOR UPDATE`: la segunda operación ve el saldo ya movido. */
export function createSerialLedger(initial: MemoryLedger) {
  let state = initial;
  let chain = Promise.resolve();

  return {
    snapshot: () => state,
    apply(input: { id: string; delta: number; externalRef?: string | null }) {
      const run = chain.then(() => {
        const result = commitLedger(state, input);
        state = result.state;
        return result;
      });
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}
