"use client";

import { Gauge } from "lucide-react";

import { meterLabel, type CostMeterView } from "@/lib/vega/cost-shared";
import { cn } from "@/lib/utils";

/** Medidor simple del uso mensual de IA de Vega frente al tope del plan. */
export function UsageMeter({ view, dark = false, className }: { view: CostMeterView | null; dark?: boolean; className?: string }) {
  if (!view || view.level === "unlimited") return null;
  const pct = Math.max(0, Math.min(100, view.pct));
  const color = view.level === "capped" ? "#DC2626" : view.level === "warn" ? "#D97706" : "#7C3AED";
  const label = meterLabel(view);
  return (
    <span
      title={label}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium",
        dark ? "border-white/15 text-white/80" : "border-[#E7E2DA] text-[#5C5854]",
        className,
      )}
    >
      <Gauge className="size-3.5" style={{ color }} aria-hidden />
      <span className={cn("relative h-1.5 w-10 overflow-hidden rounded-full", dark ? "bg-white/15" : "bg-[#F0ECE6]")} aria-hidden>
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </span>
      <span className="tabular-nums">{view.level === "capped" ? "Límite" : `${Math.floor(pct)}%`}</span>
      <span className="hidden xl:inline">de IA</span>
    </span>
  );
}
