"use client";

import { Sparkles } from "lucide-react";

import { KpiCard } from "@/components/dashboard/kpi-card";
import { useCredits } from "@/components/dashboard/credit-provider";
import { formatCredits } from "@/lib/format";

export function CreditKpi() {
  const { balance } = useCredits();

  return (
    <KpiCard
      label="Créditos de IA"
      value={formatCredits(balance)}
      hint="Disponibles en el estudio"
      icon={Sparkles}
      tone="cyan"
    />
  );
}
