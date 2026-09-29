"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "lyra-theme";

function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
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
  }

  return (
    <button
      type="button"
      aria-label={dark ? "Activar modo claro" : "Activar modo oscuro"}
      className={
        className ??
        "grid h-10 w-10 place-items-center rounded-xl border border-[#E7E2DA] bg-white text-[#1E1E24] transition-colors hover:bg-[#F3F0EB] dark:border-white/15 dark:bg-[#181625] dark:text-[#F2F0F7] dark:hover:bg-[#221F30]"
      }
      onClick={toggle}
    >
      {dark === null ? null : dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}