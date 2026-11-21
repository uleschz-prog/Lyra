import { cn } from "@/lib/utils";
import type { TrendPoint } from "@/lib/dashboard/home-logic";

const tones = {
  emerald: { stroke: "#059669", fill: "rgba(16,185,129,0.18)" },
  violet: { stroke: "#7C3AED", fill: "rgba(124,58,237,0.18)" },
  cyan: { stroke: "#0891B2", fill: "rgba(6,182,212,0.18)" },
};

/** Mini gráfica de una serie real. No se renderiza si no hay movimiento. */
export function Sparkline({
  points,
  tone = "violet",
  className,
  label,
}: {
  points: TrendPoint[];
  tone?: keyof typeof tones;
  className?: string;
  label: string;
}) {
  if (points.length < 2 || points.every((point) => point.value === 0)) return null;

  const width = 120;
  const height = 40;
  const pad = 5;
  const values = points.map((point) => point.value);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const step = (width - pad * 2) / (points.length - 1);
  const y = (value: number) => height - pad - ((value - min) / span) * (height - pad * 2);
  const d = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${(pad + index * step).toFixed(2)} ${y(point.value).toFixed(2)}`)
    .join(" ");
  const area = `${d} L ${(width - pad).toFixed(2)} ${y(0).toFixed(2)} L ${pad} ${y(0).toFixed(2)} Z`;
  const color = tones[tone];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn("h-10 w-full overflow-visible", className)} role="img" aria-label={label}>
      <path d={area} fill={color.fill} />
      <path d={d} fill="none" stroke={color.stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
