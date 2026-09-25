"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import type { WalletTransaction } from "@/lib/types";

type SpendInput = {
  agentName: string;
  creditCost: number;
  note: string;
};

type CreditContextValue = {
  balance: number;
  totalEarnedCommissions: number;
  transactions: WalletTransaction[];
  spend: (input: SpendInput) => boolean;
  addCredits: (amount: number, description: string) => void;
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

  const spend = useCallback(
    (input: SpendInput) => {
      if (balanceRef.current < input.creditCost) return false;

      balanceRef.current -= input.creditCost;
      setBalance(balanceRef.current);
      setTransactions((current) => [
        {
          id: crypto.randomUUID(),
          description: `${input.agentName}: ${input.note}`,
          amountUsd: 0,
          creditDelta: -input.creditCost,
          kind: "CREDIT_SPEND",
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);

      return true;
    },
    [],
  );

  const addCredits = useCallback((amount: number, description: string) => {
    balanceRef.current += amount;
    setBalance(balanceRef.current);
    setTransactions((current) => [
      {
        id: crypto.randomUUID(),
        description,
        amountUsd: amount,
        creditDelta: amount,
        kind: "CREDIT_PURCHASE",
        createdAt: new Date().toISOString(),
      },
      ...current,
    ]);
  }, []);

  const value = useMemo(
    () => ({
      balance,
      totalEarnedCommissions,
      transactions,
      spend,
      addCredits,
    }),
    [addCredits, balance, spend, totalEarnedCommissions, transactions],
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
