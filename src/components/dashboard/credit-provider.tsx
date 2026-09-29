"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import type { WalletTransaction } from "@/lib/types";

type CreditContextValue = {
  balance: number;
  totalEarnedCommissions: number;
  transactions: WalletTransaction[];
  /** Muestra el saldo que devolvió el servidor y, si hubo cobro, lo agrega al historial visible. */
  syncBalance: (credits: number | undefined, description?: string) => void;
};

const CreditContext = createContext<CreditContextValue | null>(null);

export function CreditProvider({
  initialBalance,
  initialTransactions,
  totalEarnedCommissions,
  children,
}: {
  initialBalance: number;
  initialTransactions: WalletTransaction[];
  totalEarnedCommissions: number;
  children: ReactNode;
}) {
  const [balance, setBalance] = useState(initialBalance);
  const [transactions, setTransactions] = useState(initialTransactions);

  const balanceRef = useRef(initialBalance);

  const syncBalance = useCallback((credits: number | undefined, description?: string) => {
    if (typeof credits !== "number" || !Number.isFinite(credits)) return;
    const delta = credits - balanceRef.current;
    balanceRef.current = credits;
    setBalance(credits);
    if (description && delta !== 0) {
      setTransactions((current) => [
        {
          id: crypto.randomUUID(),
          description,
          amountUsd: 0,
          creditDelta: delta,
          kind: delta < 0 ? "CREDIT_SPEND" : "ADJUSTMENT",
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);
    }
  }, []);

  const value = useMemo(
    () => ({
      balance,
      totalEarnedCommissions,
      transactions,
      syncBalance,
    }),
    [balance, syncBalance, totalEarnedCommissions, transactions],
  );

  return <CreditContext.Provider value={value}>{children}</CreditContext.Provider>;
}

export function useCredits() {
  const context = useContext(CreditContext);
  if (!context) {
    throw new Error("useCredits debe usarse dentro de CreditProvider.");
  }
  return context;
}
