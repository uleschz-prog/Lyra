import { accumulateTrend, hasTrend, type TrendPoint } from "@/lib/dashboard/home-logic";
import { monotoneCurve } from "@/lib/dashboard/sparkline-path";
import { cn } from "@/lib/utils";

const tones = {
  emerald: { stroke: "#059669", from: "rgba(16,185,129,0.38)", to: "rgba(16,185,129,0)" },
  violet: { stroke: "#7C3AED", from: "rgba(124,58,237,0.38)", to: "rgba(124,58,237,0)" },
  cyan: { stroke: "#0891B2", from: "rgba(6,182,212,0.38)", to: "rgba(6,182,212,0)" },
};

const WIDTH = 320;
const HEIGHT = 56;
const PAD_X = 0;
const PAD_Y = 10;
const RIBBON = 22;

/** Mini gráfica de una serie real, a lo ancho de la tarjeta. Si no hay movimiento, deja una línea base del mismo alto. */
export function Sparkline({
  points,
  tone = "violet",
  className,
  label,
  cumulative = true,
}: {
  points: TrendPoint[];
  tone?: keyof typeof tones;
  className?: string;
  label: string;
  cumulative?: boolean;
}) {
  const series = cumulative ? accumulateTrend(points) : points;
  if (!hasTrend(points) || series.length < 2) {
    return <SparklineBaseline className={className} />;
  }

  const values = series.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const innerW = WIDTH - PAD_X * 2;
  const zeroY = 28;
  const step = innerW / (series.length - 1);
  const yOf = (value: number) => {
    if (value >= 0) {
      const span = Math.max(max, 0) || 1;
      return zeroY - (value / span) * (zeroY - PAD_Y);
    }
    const span = Math.abs(Math.min(min, 0)) || 1;
    return zeroY + (Math.abs(value) / span) * (HEIGHT - PAD_Y - zeroY);
  };
  const coords = series.map((point, index) => ({
    x: PAD_X + index * step,
    y: yOf(point.value),
  }));
  const lower = coords.map((point) => ({ x: point.x, y: Math.min(HEIGHT - 1, point.y + RIBBON) }));
  const line = monotoneCurve(coords);
  const underside = monotoneCurve([...lower].reverse()).replace(/^M /u, "L ");
  const lastLower = lower[lower.length - 1];
  const area = `${line} L ${lastLower.x.toFixed(2)} ${lastLower.y.toFixed(2)} ${underside} Z`;
  const color = tones[tone];
  const gradId = `spark-fill-${tone}-${label.replace(/[^a-z0-9]+/gi, "").slice(0, 24) || "k"}`;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={cn("h-14 w-full", className)}
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color.from} />
          <stop offset="100%" stopColor={color.to} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={color.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function SparklineBaseline({ className }: { className?: string }) {
  const y = 28;
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className={cn("h-14 w-full", className)} aria-hidden>
      <rect x="0" y={y} width={WIDTH} height="16" className="fill-[#1E1E24]/[0.04] dark:fill-white/5" />
      <line
        x1={0}
        x2={WIDTH}
        y1={y}
        y2={y}
        className="stroke-[#E0DCD4] dark:stroke-white/12"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}
