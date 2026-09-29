import { cn } from "@/lib/utils";

export function Logo({
  compact = false,
  className,
  ink = false,
}: {
  compact?: boolean;
  className?: string;
  mark?: "AI" | "ENGINE";
  ink?: boolean;
}) {
  const line = ink ? "#1E1E24" : "#F5F3FF";

  return (
    <span className={cn("lyra-logo inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
        <circle cx="16" cy="16" r="10.25" fill="#7C3AED" />
        <path
          d="M2.5 11.6 L24.7 4.8 L14 30.1"
          fill="none"
          stroke={line}
          strokeWidth="1.55"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="2.5" cy="11.6" r="1.7" fill={line} />
        <circle cx="24.7" cy="4.8" r="2.25" fill={line} />
        <circle cx="14" cy="30.1" r="1.7" fill={line} />
      </svg>
      {compact ? null : (
        <span className={cn("text-xl font-bold tracking-tighter", ink ? "text-[#1E1E24]" : "text-white")}>LYRA</span>
      )}
    </span>
  );
}
