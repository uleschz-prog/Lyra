"use client";

import { useEffect, useState } from "react";

import { VegaMascot } from "@/components/vega/vega-mark";
import { brand } from "@/config/brand";

const STORAGE_KEY = "lyra-splash-shown";
const VISIBLE_MS = 900;

type Phase = "hidden" | "visible" | "fading";

export function Splash() {
  // El primer render es igual en servidor y navegador. Leer sessionStorage
  // aquí deshacía la página y el primer clic (por ejemplo Iniciar sesión) se perdía.
  const [phase, setPhase] = useState<Phase>("visible");

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === "1") {
        setPhase("hidden");
        return;
      }
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // sessionStorage no disponible: no dejamos una capa encima del contenido.
      setPhase("hidden");
      return;
    }

    const fadingTimer = setTimeout(() => setPhase("fading"), VISIBLE_MS);
    const hiddenTimer = setTimeout(() => setPhase("hidden"), VISIBLE_MS + 350);
    const failSafe = setTimeout(() => setPhase("hidden"), VISIBLE_MS + 1500);

    return () => {
      clearTimeout(fadingTimer);
      clearTimeout(hiddenTimer);
      clearTimeout(failSafe);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-[#7C3AED] to-[#2E1065] transition-opacity duration-300"
      style={{ opacity: phase === "fading" ? 0 : 1 }}
    >
      <div className="splash-entrance">
        <VegaMascot className="h-32 w-32" />
      </div>
      <p className="splash-entrance splash-entrance-delayed text-3xl font-semibold tracking-tight text-white">
        {brand.name}
      </p>
    </div>
  );
}
