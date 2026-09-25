"use client";

import { useMemo, useState } from "react";

import { useCredits } from "@/components/dashboard/credit-provider";
import { formatCredits, formatDate, formatUsd } from "@/lib/format";
import type { TransactionKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const filters: { id: "all" | "money" | "credits"; label: string }[] = [
  { id: "all", label: "Todo" },
  { id: "money", label: "Comisiones" },
  { id: "credits", label: "Créditos" },
];

const kindLabel: Record<TransactionKind, string> = {
  COMMISSION: "Comisión",
  CREDIT_PURCHASE: "Compra",
  CREDIT_SPEND: "Consumo",
  ADJUSTMENT: "Ajuste",
  REBUY: "Recompra",
  CREDIT_REFUND: "Reembolso",
};

export function WalletPanel() {
  const { balance, totalEarnedCommissions, transactions } = useCredits();
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");

  const visible = useMemo(() => {
    if (filter === "money") return transactions.filter((item) => item.kind === "COMMISSION");
    if (filter === "credits") return transactions.filter((item) => item.creditDelta !== 0);
    return transactions;
  }, [filter, transactions]);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-border bg-surface/80 backdrop-blur-md transition-colors hover:border-border-bright p-6">
          <p className="text-[11px] font-medium tracking-[0.22em] text-[#5C5854] uppercase">Comisiones acumuladas</p>
          <p className="mt-3 text-3xl text-[#7C3AED] tabular-nums">
            {formatUsd(totalEarnedCommissions)}
          </p>
        </article>
        <article className="rounded-2xl border border-border bg-surface/80 backdrop-blur-md transition-colors hover:border-border-bright p-6">
          <p className="text-[11px] font-medium tracking-[0.22em] text-[#5C5854] uppercase">Créditos de IA</p>
          <p className="mt-3 text-3xl text-[#7C3AED] tabular-nums">{formatCredits(balance)}</p>
        </article>
      </section>

      <section className="rounded-2xl border border-border bg-surface/80 backdrop-blur-md transition-colors hover:border-border-bright">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-lyra-border px-5 py-4">
          <h2 className="text-sm tracking-[0.16em] text-[#1E1E24]">MOVIMIENTOS</h2>
          <div className="flex gap-2">
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs transition-all duration-300 ease-in-out",
                  filter === item.id
                    ? "border-[#7C3AED]/30 bg-[#7C3AED]/10 text-[#1E1E24]"
                    : "border-border bg-[#F4F1EC] text-[#5C5854] hover:border-[#C9C3BA] hover:text-[#1E1E24]",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <ul>
          {visible.map((transaction) => (
            <li
              key={transaction.id}
              className="grid gap-2 border-b border-lyra-border px-5 py-4 last:border-b-0 sm:grid-cols-[140px_minmax(0,1fr)_auto] sm:items-center"
            >
              <p className="text-xs uppercase tracking-[0.14em] text-[#8A8680]">
                {kindLabel[transaction.kind]}
              </p>
              <div>
                <p className="text-sm text-[#1E1E24]">{transaction.description}</p>
                <p className="mt-1 text-xs text-[#8A8680]">{formatDate(transaction.createdAt)}</p>
              </div>
              <p
                className={cn(
                  "text-sm tabular-nums sm:text-right",
                  transaction.kind === "COMMISSION" && "text-violet-200",
                  transaction.creditDelta > 0 && "text-lyra-cyan",
                  transaction.creditDelta < 0 && "text-[#5C5854]",
                )}
              >
                {transaction.kind === "COMMISSION"
                  ? formatUsd(transaction.amountUsd)
                  : `${transaction.creditDelta > 0 ? "+" : ""}${formatCredits(transaction.creditDelta)} cr`}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
