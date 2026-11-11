"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "lyra-theme";

function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle({ className, showLabel = false }: { className?: string; showLabel?: boolean }) {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    function syncTheme() {
      setDark(document.documentElement.classList.contains("dark"));
    }

    const frame = window.requestAnimationFrame(syncTheme);
    window.addEventListener("lyra-theme-change", syncTheme);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("lyra-theme-change", syncTheme);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  function toggle() {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // sin persistencia disponible
    }
    applyTheme(next);
    setDark(next === "dark");
    window.dispatchEvent(new Event("lyra-theme-change"));
  }

  return (
    <button
      type="button"
      aria-label={dark ? "Activar modo claro" : "Activar modo oscuro"}
      aria-pressed={dark ?? false}
      title={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className={
        className ??
        "grid h-10 w-10 place-items-center rounded-xl border border-[#E7E2DA] bg-white text-[#1E1E24] transition-colors hover:bg-[#F3F0EB] dark:border-white/15 dark:bg-[#181625] dark:text-[#F2F0F7] dark:hover:bg-[#221F30]"
      }
      onClick={toggle}
    >
      {dark ? <Sun className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Moon className="h-4 w-4 shrink-0" aria-hidden="true" />}
      {showLabel ? <span>{dark ? "Modo claro" : "Modo oscuro"}</span> : null}
    </button>
  );
}