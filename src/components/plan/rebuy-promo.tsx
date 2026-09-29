import { cn } from "@/lib/utils";

export function PromoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#DC2626] to-[#7C3AED] px-2.5 py-1 text-[11px] font-medium tracking-wide text-white",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden />
      Tiempo limitado
    </span>
  );
}

export function RebuyPromo({ before, now, className }: { before: number; now: number; className?: string }) {
  return (
    <div className={cn("mt-3", className)}>
      <p className="flex flex-wrap items-baseline gap-x-2 text-base">
        <span className="text-[#8A8680] line-through decoration-[#DC2626] decoration-2">${before} al mes</span>
        <span className="font-semibold text-[#7C3AED]">${now} al mes de por vida</span>
      </p>
      <p className="mt-1 text-xs text-[#8A8680]">Recarga congelada para siempre si entras durante la promoción.</p>
    </div>
  );
}
