"use client";

import { useEffect, useState } from "react";

import { VegaMascot } from "@/components/vega/vega-mark";
import { brand } from "@/config/brand";

const STORAGE_KEY = "lyra-splash-shown";
const VISIBLE_MS = 1200;

export function Splash() {
  const [phase, setPhase] = useState<"hidden" | "visible" | "fading">("hidden");

  useEffect(() => {
    let fadingTimer: ReturnType<typeof setTimeout>;
    let hiddenTimer: ReturnType<typeof setTimeout>;

    try {
      if (sessionStorage.getItem(STORAGE_KEY)) return;
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // sessionStorage puede no estar disponible (modo privado); mostrar igual.
    }

    setPhase("visible");
    fadingTimer = setTimeout(() => setPhase("fading"), VISIBLE_MS);
    hiddenTimer = setTimeout(() => setPhase("hidden"), VISIBLE_MS + 450);

    return () => {
      clearTimeout(fadingTimer);
      clearTimeout(hiddenTimer);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-[#7C3AED] to-[#2E1065] transition-opacity duration-400"
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