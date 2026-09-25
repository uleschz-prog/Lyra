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
          "mb-8 grid h-9 w-9 place-items-center rounded-lg border border-border bg-[#F4F1EC]",
          tone === "cyan" ? "text-[#06B6D4]" : "text-accent-purple",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <p className="text-[11px] tracking-[0.16em] text-[#8A8680] uppercase">{label}</p>
      <p className="mt-2 text-2xl text-[#1E1E24] tabular-nums">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-[#5C5854]">{hint}</p>
    </Card>
  );
}
