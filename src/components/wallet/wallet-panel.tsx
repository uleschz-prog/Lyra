"use client";

import { useMemo, useState } from "react";

import { useCredits } from "@/components/dashboard/credit-provider";
import { Button } from "@/components/ui/button";
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
        <article className="rounded-2xl border border-lyra-border bg-lyra-card p-6 shadow-[0_0_15px_rgba(124,58,237,0.15)]">
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Comisiones acumuladas</p>
          <p className="mt-3 font-mono text-3xl tabular-nums text-white">
            {formatUsd(totalEarnedCommissions)}
          </p>
        </article>
        <article className="rounded-2xl border border-lyra-border bg-lyra-card p-6 shadow-[0_0_15px_rgba(6,182,212,0.12)]">
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Créditos de IA</p>
          <p className="mt-3 font-mono text-3xl tabular-nums text-lyra-cyan">{formatCredits(balance)}</p>
        </article>
      </section>

      <section className="rounded-2xl border border-lyra-border bg-lyra-card shadow-[0_0_15px_rgba(124,58,237,0.12)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-lyra-border px-5 py-4">
          <h2 className="text-sm tracking-[0.16em] text-white">MOVIMIENTOS</h2>
          <div className="flex gap-2">
            {filters.map((item) => (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={filter === item.id ? "default" : "outline"}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
        <ul>
          {visible.map((transaction) => (
            <li
              key={transaction.id}
              className="grid gap-2 border-b border-lyra-border px-5 py-4 last:border-b-0 sm:grid-cols-[140px_minmax(0,1fr)_auto] sm:items-center"
            >
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                {kindLabel[transaction.kind]}
              </p>
              <div>
                <p className="text-sm text-zinc-100">{transaction.description}</p>
                <p className="mt-1 text-xs text-zinc-500">{formatDate(transaction.createdAt)}</p>
              </div>
              <p
                className={cn(
                  "font-mono text-sm tabular-nums sm:text-right",
                  transaction.kind === "COMMISSION" && "text-violet-200",
                  transaction.creditDelta > 0 && "text-lyra-cyan",
                  transaction.creditDelta < 0 && "text-zinc-300",
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
