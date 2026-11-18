"use client";

import { useId } from "react";

import type { VegaMood } from "@/lib/vega/events";
import { hashOf, mascotPalette, type Mascot, type MascotShape } from "@/lib/vega/mascot";
import { cn } from "@/lib/utils";

/** Estrella de puntas suaves (las puntas son controles de curvas cuadráticas). */
function starPath(points = 6, outer = 28, inner = 17, cx = 32, cy = 34) {
  const at = (radius: number, index: number) => {
    const angle = -Math.PI / 2 + (index * Math.PI) / points;
    return `${(cx + radius * Math.cos(angle)).toFixed(2)} ${(cy + radius * Math.sin(angle)).toFixed(2)}`;
  };
  let path = `M${at(inner, -1)}`;
  for (let index = 0; index < points; index += 1) path += ` Q${at(outer, index * 2)} ${at(inner, index * 2 + 1)}`;
  return `${path}Z`;
}

type ShapeSpec = { body: string; eyes: { y: number; gap: number; rx: number; ry: number } };

const shapes: Record<MascotShape, ShapeSpec> = {
  vega: { body: "M32 9C48 9 57 19 57 33C57 47 47 56 32 56C17 56 7 47 7 33C7 19 16 9 32 9Z", eyes: { y: 33, gap: 7, rx: 3.6, ry: 5.4 } },
  drop: { body: "M32 5C38 15 54 25 54 40C54 51 44 58 32 58C20 58 10 51 10 40C10 25 26 15 32 5Z", eyes: { y: 39, gap: 7, rx: 3.4, ry: 4.9 } },
  blob: { body: "M33 8C46 8 57 16 56 31C55 46 47 57 31 56C17 55 8 47 8 33C8 18 19 8 33 8Z", eyes: { y: 32, gap: 7.5, rx: 3.5, ry: 5 } },
  bumps: {
    body: "M9 40C9 27 12 15 21 12C27 10 30 15 32 18C34 15 37 10 43 12C52 15 55 27 55 40C55 51 45 57 32 57C19 57 9 51 9 40Z",
    eyes: { y: 36, gap: 7.5, rx: 3.4, ry: 4.9 },
  },
  star: { body: starPath(), eyes: { y: 35, gap: 6.5, rx: 3.2, ry: 4.6 } },
  pill: { body: "M24 15H40C50 15 57 23 57 33C57 43 50 51 40 51H24C14 51 7 43 7 33C7 23 14 15 24 15Z", eyes: { y: 33, gap: 8, rx: 3.4, ry: 4.8 } },
  ghost: {
    body: "M12 31C12 18 21 9 32 9C43 9 52 18 52 31V53C49 57 46 57 43.5 53.5C41 57 37.5 57 35 53.5C32.5 57 29 57 26.5 53.5C24 57 20.5 57 18 53.5C15.5 57 13 56 12 53Z",
    eyes: { y: 30, gap: 7, rx: 3.4, ry: 4.9 },
  },
  cloud: {
    body: "M17 52C10 52 6 47 6 41C6 35 10 31 16 30C16 22 22 16 30 16C36 16 41 19 43 24C51 23 58 29 58 37C58 45 52 52 44 52Z",
    eyes: { y: 38, gap: 7.5, rx: 3.3, ry: 4.7 },
  },
};

function Eyes({ spec, mood, delay }: { spec: ShapeSpec["eyes"]; mood: VegaMood; delay: string }) {
  const left = 32 - spec.gap;
  const right = 32 + spec.gap;
  if (mood === "happy") {
    const arc = (x: number) => `M${x - spec.rx - 0.4} ${spec.y + 1.2}Q${x} ${spec.y - spec.ry} ${x + spec.rx + 0.4} ${spec.y + 1.2}`;
    return (
      <g fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round">
        <path d={arc(left)} />
        <path d={arc(right)} />
      </g>
    );
  }
  const scale = mood === "surprised" ? 1.2 : 1;
  const ry = mood === "surprised" ? spec.rx * 1.25 : mood === "sad" ? spec.ry * 0.85 : spec.ry;
  const y = mood === "sad" ? spec.y + 1.2 : spec.y;
  return (
    <g fill="#fff">
      <ellipse className="mascot-eye" style={{ animationDelay: delay }} cx={left} cy={y} rx={spec.rx * scale} ry={ry} />
      <ellipse className="mascot-eye" style={{ animationDelay: delay }} cx={right} cy={y} rx={spec.rx * scale} ry={ry} />
    </g>
  );
}

/**
 * Mascota de un agente: cuerpo de color con brillo suave y dos ojos blancos ovalados que parpadean.
 * Vega conserva su forma (redonda, con un destello). Respeta «reducir movimiento».
 */
export function AgentMascot({
  mascot,
  seed = "",
  mood = "neutral",
  thinking = false,
  still = false,
  className,
  title,
}: {
  mascot: Mascot;
  /** Desfasa el parpadeo para que no todas las mascotas parpadeen a la vez. */
  seed?: string;
  mood?: VegaMood;
  thinking?: boolean;
  still?: boolean;
  className?: string;
  /** Si se da, la mascota se anuncia a lectores de pantalla; si no, es decorativa. */
  title?: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const spec = shapes[mascot.shape];
  const colors = mascotPalette[mascot.color];
  const delay = `-${(hashOf(seed || mascot.shape) % 4000) / 1000}s`;
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("agent-mascot block size-9 shrink-0 overflow-visible", className)}
      data-thinking={thinking || undefined}
      data-static={still || undefined}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <radialGradient id={`${id}-fill`} cx="35%" cy="25%" r="85%">
          <stop offset="0%" stopColor={colors.light} />
          <stop offset="55%" stopColor={colors.base} />
          <stop offset="100%" stopColor={colors.deep} />
        </radialGradient>
      </defs>
      <g className="mascot-body">
        <ellipse cx="32" cy="60" rx="15" ry="2.4" fill={colors.deep} opacity="0.16" />
        <path d={spec.body} fill={`url(#${id}-fill)`} stroke={mascot.color === "black" ? "rgba(255,255,255,0.14)" : "none"} strokeWidth={mascot.color === "black" ? 1 : 0} />
        <ellipse cx="22" cy={spec.eyes.y - 13} rx="7" ry="3.6" fill="#fff" opacity="0.22" transform={`rotate(-24 22 ${spec.eyes.y - 13})`} />
        {mascot.shape === "vega" ? (
          <path d="M51 4.5 52.6 9.4 57.5 11 52.6 12.6 51 17.5 49.4 12.6 44.5 11 49.4 9.4Z" fill="#06B6D4" stroke="#fff" strokeWidth="1" strokeLinejoin="round" />
        ) : null}
        <Eyes spec={spec.eyes} mood={still ? "neutral" : mood} delay={delay} />
      </g>
    </svg>
  );
}
