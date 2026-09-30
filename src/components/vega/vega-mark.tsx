"use client";

import { useEffect, useState } from "react";

import type { VegaMood } from "@/lib/vega/events";
import { cn } from "@/lib/utils";

function Eyes({ mood }: { mood: VegaMood }) {
  const line = { stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, fill: "none" };

  if (mood === "happy") {
    return (
      <>
        <path d="M7.4 12.8 Q9 10 10.6 12.8" {...line} strokeWidth={1.8} />
        <path d="M13.4 12.8 Q15 10 16.6 12.8" {...line} strokeWidth={1.8} />
        <ellipse cx="7.2" cy="14.6" rx="1.1" ry="0.6" fill="#F9A8D4" opacity="0.8" />
        <ellipse cx="16.8" cy="14.6" rx="1.1" ry="0.6" fill="#F9A8D4" opacity="0.8" />
      </>
    );
  }
  if (mood === "angry") {
    return (
      <>
        <path d="M7 9.4 10.7 10.8" {...line} />
        <path d="M17 9.4 13.3 10.8" {...line} />
        <rect className="vega-eye" x="8.1" y="11.3" width="1.9" height="3" rx="0.95" />
        <rect className="vega-eye" x="14" y="11.3" width="1.9" height="3" rx="0.95" />
      </>
    );
  }
  if (mood === "sad") {
    return (
      <>
        <path d="M7.1 10.4 10.6 9.1" {...line} />
        <path d="M16.9 10.4 13.4 9.1" {...line} />
        <rect className="vega-eye" x="8.1" y="11.2" width="1.9" height="3.4" rx="0.95" />
        <rect className="vega-eye" x="14" y="11.2" width="1.9" height="3.4" rx="0.95" />
        <path className="vega-tear" d="M9.05 15.6c-.5.8-.75 1.3-.75 1.7a.75.75 0 0 0 1.5 0c0-.4-.25-.9-.75-1.7Z" fill="#BFDBFE" />
      </>
    );
  }
  if (mood === "surprised") {
    return (
      <>
        <circle cx="9" cy="11.4" r="1.9" fill="currentColor" />
        <circle cx="15" cy="11.4" r="1.9" fill="currentColor" />
        <ellipse cx="12" cy="15.7" rx="0.9" ry="1.1" fill="currentColor" />
      </>
    );
  }
  if (mood === "doubt") {
    return (
      <>
        <path d="M7.4 8.7 Q9 7.6 10.6 8.7" {...line} />
        <rect className="vega-eye" x="8.05" y="10" width="1.9" height="4.2" rx="0.95" />
        <path d="M13.8 12.2 16.2 12.2" {...line} strokeWidth={1.7} />
        <path d="M11 15.8 Q12.2 15.2 13.4 15.9" {...line} strokeWidth={1.2} />
      </>
    );
  }
  return (
    <>
      <rect className="vega-eye" x="8.05" y="9.8" width="1.9" height="4.4" rx="0.95" />
      <rect className="vega-eye" x="14.05" y="9.8" width="1.9" height="4.4" rx="0.95" />
    </>
  );
}

export function VegaMark({
  className,
  mood = "neutral",
  thinking = false,
  still = false,
}: {
  className?: string;
  mood?: VegaMood;
  thinking?: boolean;
  still?: boolean;
}) {
  const face = still ? "neutral" : mood;
  return (
    <span
      className={cn("vega-mark relative grid shrink-0 place-items-center", className)}
      data-mood={face}
      data-thinking={thinking || undefined}
      data-static={still || undefined}
      aria-hidden
    >
      <span className="vega-body absolute inset-0 overflow-hidden rounded-full bg-gradient-to-br from-[#A78BFA] via-[#7C3AED] to-[#4C1D95] shadow-[inset_0_1px_2px_rgba(255,255,255,0.35),0_4px_14px_-4px_rgba(124,58,237,0.55)]">
        <span className="vega-tint vega-tint-angry absolute inset-0 bg-gradient-to-br from-[#FB7185] via-[#E11D48] to-[#881337]" />
        <span className="vega-tint vega-tint-sad absolute inset-0 bg-gradient-to-br from-[#A5B4FC] via-[#6366F1] to-[#312E81]" />
      </span>
      <span key={face} className="vega-face relative size-full text-white">
        <svg viewBox="0 0 24 24" className="vega-eyes size-full" fill="currentColor">
          <Eyes mood={face} />
        </svg>
      </span>
    </span>
  );
}

const greetingMoods: VegaMood[] = ["happy", "neutral", "surprised", "doubt", "happy", "neutral"];

/** Vega de bienvenida: va pasando por sus emociones. */
export function VegaGreeting({ className }: { className?: string }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setStep((current) => (current + 1) % greetingMoods.length), 3500);
    return () => window.clearInterval(timer);
  }, []);

  return <VegaMark className={className} mood={greetingMoods[step]} />;
}

/**
 * VegaMascot: la mascota en su forma original — solo el rostro con sus emociones
 * animadas. Sin cuerpo ni antena. Se usa en el splash como logo y en las tarjetas
 * destacadas (referidos, planes, landing).
 */
export function VegaMascot({
  className = "h-32 w-32",
  mood = "happy",
}: {
  className?: string;
  mood?: VegaMood;
}) {
  // El rostro respira sus emociones en ciclo; `mood` marca con cuál arranca.
  const moods: VegaMood[] = [mood, "neutral", "happy", "surprised", "doubt"];
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setStep((current) => (current + 1) % moods.length), 4200);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <VegaMark className={className} mood={moods[step]} />;
}
