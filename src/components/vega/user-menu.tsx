"use client";

import { LayoutGrid, Settings } from "lucide-react";
import type { ReactNode } from "react";

import { CreditRing } from "@/components/vega/credit-ring";
import { UsageMeter } from "@/components/vega/usage-meter";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatCredits } from "@/lib/format";
import type { CostMeterView } from "@/lib/vega/cost-shared";

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "TÚ"
  );
}

/** Menú del socio en la barra de Vega: créditos, ajustes y el menú de LYRA. */
export function UserMenu({
  userName,
  balance,
  tank,
  costMeter,
  variant = "sidebar",
  onOpenSettings,
  onOpenLyraMenu,
}: {
  userName: string;
  balance: number;
  tank: number;
  costMeter: CostMeterView | null;
  variant?: "sidebar" | "home";
  onOpenSettings: () => void;
  onOpenLyraMenu: () => void;
}) {
  const initials = initialsOf(userName);
  const creditsLabel = `${formatCredits(balance)} crédito${balance === 1 ? "" : "s"}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "home" ? (
          <button
            type="button"
            className="grid size-11 place-items-center rounded-full bg-[linear-gradient(135deg,#7C3AED,#06B6D4)] text-sm font-semibold text-white transition focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none"
            aria-label={`Menú de ${userName}. ${creditsLabel}`}
            title={creditsLabel}
          >
            {initials}
          </button>
        ) : (
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-2xl px-2 py-2 text-left transition hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none dark:hover:bg-white/[0.05]"
            aria-label={`Menú de ${userName}. ${creditsLabel}`}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#7C3AED,#06B6D4)] text-xs font-semibold text-white">{initials}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-[#1E1E24] dark:text-white">{userName}</span>
              <span className="block truncate text-xs text-[#8A8680]">{creditsLabel}</span>
            </span>
            <LayoutGrid className="size-4 shrink-0 text-[#8A8680]" aria-hidden />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={variant === "home" ? "bottom" : "top"}
        align="start"
        className="dark:border-white/10 dark:bg-[#1B1924] dark:text-white"
      >
        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
          <CreditRing balance={balance} tank={tank} size={32} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold tabular-nums text-[#1E1E24] dark:text-white">{creditsLabel}</p>
            {costMeter && costMeter.level !== "unlimited" ? (
              <UsageMeter view={costMeter} className="mt-1" />
            ) : (
              <p className="text-[11px] text-[#8A8680]">Uso de IA: sin tope en tu plan</p>
            )}
          </div>
        </div>
        <div className="my-1 h-px bg-[#F0ECE6] dark:bg-white/8" role="separator" />
        <MenuRow icon={<Settings className="size-4" />} onSelect={onOpenSettings}>
          Ajustes
        </MenuRow>
        <MenuRow icon={<LayoutGrid className="size-4" />} onSelect={onOpenLyraMenu}>
          Menú de LYRA
        </MenuRow>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuRow({ icon, onSelect, children }: { icon: ReactNode; onSelect: () => void; children: ReactNode }) {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      className="gap-2.5 dark:focus:bg-white/8 dark:focus:text-white"
    >
      <span className="grid size-7 place-items-center rounded-lg bg-[#F5F3FF] text-[#7C3AED] dark:bg-[#7C3AED]/20 dark:text-[#C4B5FD]">{icon}</span>
      {children}
    </DropdownMenuItem>
  );
}
