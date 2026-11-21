"use client";

import { useEffect, useReducer, useRef } from "react";

/** Anima un número al montar. Si el usuario pide menos movimiento, muestra el valor final de inmediato. */
export function CountUp({
  value,
  format,
  className,
  duration = 700,
}: {
  value: number;
  format: (value: number) => string;
  className?: string;
  duration?: number;
}) {
  const reduce = useRef(false);
  const [shown, setShown] = useReducer((_prev: number, next: number) => next, 0);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
    try {
      reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduce.current = false;
    }
    if (reduce.current || duration <= 0) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const from = 0;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setShown(from + (valueRef.current - from) * eased);
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [value, duration]);

  return (
    <span className={className} data-value={value}>
      {format(shown)}
    </span>
  );
}
