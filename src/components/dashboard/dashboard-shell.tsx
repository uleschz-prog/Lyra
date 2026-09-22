"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { useCredits } from "@/components/dashboard/credit-provider";
import { Sidebar } from "@/components/dashboard/sidebar";
import { formatCredits } from "@/lib/format";
import type { DemoUser } from "@/lib/types";
import { cn } from "@/lib/utils";

export function DashboardShell({
  user,
  children,
}: {
  user: DemoUser;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const open = menuPath === pathname;
  const { balance } = useCredits();

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuPath(null);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="min-h-screen bg-lyra-dark">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-[272px] border-r border-lyra-border bg-[#0E0E18]/95 backdrop-blur-xl transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Sidebar user={user} onClose={() => setMenuPath(null)} />
      </aside>

      {open ? (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setMenuPath(null)}
        />
      ) : null}

      <div className="lg:pl-[272px]">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-lyra-border bg-lyra-dark/80 px-4 py-3 backdrop-blur-xl lg:hidden">
          <button
            type="button"
            aria-label="Abrir menú"
            aria-expanded={open}
            className="grid h-10 w-10 place-items-center rounded-xl border border-lyra-border text-zinc-200"
            onClick={() => setMenuPath(open ? null : pathname)}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          <Logo compact />
          <span className="font-mono text-sm tabular-nums text-lyra-cyan">
            {formatCredits(balance)}
          </span>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10">{children}</main>
      </div>
    </div>
  );
}
