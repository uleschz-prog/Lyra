"use client";

import { Sparkles } from "lucide-react";

import { useCredits } from "@/components/dashboard/credit-provider";
import { StatLink } from "@/components/dashboard/stat-link";
import { brand } from "@/config/brand";
import { formatCredits } from "@/lib/format";

export function CreditStat() {
  const { balance } = useCredits();
  const low = balance < 50;

  return (
    <StatLink href={brand.links.wallet} label="Créditos de IA" icon={Sparkles} tone="cyan">
      <p className="mt-2 text-2xl font-semibold text-[#1E1E24] tabular-nums">{formatCredits(balance)}</p>
      <p className={low ? "mt-1 text-xs font-medium text-[#B45309]" : "mt-1 text-xs text-[#5C5854]"}>
        {low ? "Saldo bajo · recarga en tu billetera" : "Disponibles para crear"}
      </p>
    </StatLink>
  );
}
