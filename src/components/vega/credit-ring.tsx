"use client";

import { formatCredits } from "@/lib/format";
import { creditRingRatio } from "@/lib/vega/credit-meter";
import { cn } from "@/lib/utils";

export function CreditRing({
  balance,
  tank,
  className,
  size = 28,
}: {
  balance: number;
  tank: number;
  className?: string;
  size?: number;
}) {
  const ratio = creditRingRatio(balance, tank);
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const center = size / 2;
  const turn = 2 * Math.PI * radius;
  const color = ratio > 0.2 ? "#7C3AED" : ratio > 0.08 ? "#D97706" : "#DC2626";
  const label = `${formatCredits(Math.max(0, balance))} créditos`;

  return (
    <span title={label} className={cn("inline-flex shrink-0", className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          className="stroke-[#E7E2DA] dark:stroke-white/15"
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${turn * ratio} ${turn}`}
          transform={`rotate(-90 ${center} ${center})`}
          className="transition-[stroke-dasharray] duration-500"
        />
      </svg>
    </span>
  );
}
