"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import type { WalletTransaction } from "@/lib/types";

type CreditContextValue = {
  balance: number;
  totalEarnedCommissions: number;
  transactions: WalletTransaction[];
  applyServerBalance: (balance: number, transaction?: WalletTransaction | null) => void;
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

  const applyServerBalance = useCallback((nextBalance: number, transaction?: WalletTransaction | null) => {
    if (!Number.isInteger(nextBalance)) return;
    balanceRef.current = nextBalance;
    setBalance(nextBalance);
    if (!transaction) return;
    setTransactions((current) => (current.some((item) => item.id === transaction.id) ? current : [transaction, ...current]));
  }, []);

  const value = useMemo(
    () => ({
      balance,
      totalEarnedCommissions,
      transactions,
      applyServerBalance,
    }),
    [applyServerBalance, balance, totalEarnedCommissions, transactions],
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

export function readReturnedBalance(response: Response, body: unknown) {
  if (body && typeof body === "object" && typeof (body as { balance?: unknown }).balance === "number") {
    const balance = (body as { balance: number }).balance;
    return Number.isInteger(balance) ? balance : null;
  }
  const header = Number(response.headers.get("x-credit-balance"));
  return Number.isInteger(header) ? header : null;
}

export function readReturnedTransaction(body: unknown): WalletTransaction | null {
  if (!body || typeof body !== "object") return null;
  const transaction = (body as { transaction?: unknown }).transaction;
  if (!transaction || typeof transaction !== "object") return null;
  const row = transaction as Partial<WalletTransaction>;
  if (typeof row.id !== "string" || typeof row.creditDelta !== "number" || typeof row.kind !== "string") return null;
  if (typeof row.description !== "string" || typeof row.createdAt !== "string" || typeof row.amountUsd !== "number") return null;
  return {
    id: row.id,
    description: row.description,
    amountUsd: row.amountUsd,
    creditDelta: row.creditDelta,
    kind: row.kind,
    createdAt: row.createdAt,
  };
}
