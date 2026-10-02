"use client";

import { useEffect, useState } from "react";

import { VegaMascot } from "@/components/vega/vega-mark";
import { brand } from "@/config/brand";

const STORAGE_KEY = "lyra-splash-shown";
const VISIBLE_MS = 900;

type Phase = "hidden" | "visible" | "fading";

export function Splash() {
  // Arranca visible salvo que ya se haya mostrado en esta sesión.
  // Así el splash no depende de un setState dentro del efecto.
  const [phase, setPhase] = useState<Phase>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === "1" ? "hidden" : "visible";
    } catch {
      // sessionStorage no disponible (modo privado, PWA, WebView):
      // no mostramos el splash para no arriesgar una capa que bloquee el contenido.
      return "hidden";
    }
  });

  useEffect(() => {
    if (phase === "hidden") return;

    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Ignorar: la marca de sesión es solo una optimización.
    }

    const fadingTimer = setTimeout(() => setPhase("fading"), VISIBLE_MS);
    const hiddenTimer = setTimeout(() => setPhase("hidden"), VISIBLE_MS + 350);
    // Red de seguridad: el splash nunca puede quedarse visible.
    const failSafe = setTimeout(() => setPhase("hidden"), VISIBLE_MS + 1500);

    return () => {
      clearTimeout(fadingTimer);
      clearTimeout(hiddenTimer);
      clearTimeout(failSafe);
    };
  }, [phase]);

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
