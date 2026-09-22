import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "violet",
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone?: "violet" | "cyan";
}) {
  return (
    <Card className="p-5">
      <div
        className={cn(
          "mb-8 flex h-9 w-9 items-center justify-center rounded-xl border border-lyra-border bg-white/[0.03]",
          tone === "cyan" ? "text-lyra-cyan" : "text-lyra-violet",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">{label}</p>
      <p className="mt-2 font-mono text-2xl tabular-nums text-white">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
    </Card>
  );
}
