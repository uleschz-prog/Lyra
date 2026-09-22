import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const width = Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-valuenow={width}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/10", className)}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-lyra-violet to-lyra-cyan"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
