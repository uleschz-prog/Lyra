import { cn } from "@/lib/utils";

export function Logo({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <span className="relative grid h-9 w-9 place-items-center">
        <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-lyra-violet to-lyra-cyan opacity-80 blur-md" />
        <span className="relative grid h-9 w-9 place-items-center rounded-xl border border-white/15 bg-lyra-card text-[11px] font-semibold tracking-[0.2em] text-white shadow-[0_0_15px_rgba(124,58,237,0.45)]">
          L
        </span>
      </span>
      {compact ? null : (
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-medium tracking-[0.38em] text-white">LYRA</span>
          <span className="text-[10px] tracking-[0.18em] text-zinc-500">RED GLOBAL</span>
        </span>
      )}
    </span>
  );
}
