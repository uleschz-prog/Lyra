"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { Sidebar } from "@/components/dashboard/sidebar";
import { brand } from "@/config/brand";
import type { AuthProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

export function DashboardShell({
  user,
  children,
}: {
  user: AuthProfile;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const open = menuPath === pathname;

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuPath(null);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lyra-office min-h-screen bg-[#F6F4F1]" style={{ backgroundImage: "none" }}>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-[min(85vw,260px)] border-r border-[#E7E2DA] bg-white transition-transform md:w-[248px] md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Sidebar user={user} onClose={() => setMenuPath(null)} />
      </aside>

      {open ? (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMenuPath(null)}
        />
      ) : null}

      <div className="md:pl-[248px]">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 bg-[#F6F4F1] px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
          <button
            type="button"
            aria-label="Abrir menú"
            aria-expanded={open}
            className="grid h-11 w-11 place-items-center rounded-xl border border-[#E7E2DA] bg-white text-[#1E1E24]"
            onClick={() => setMenuPath(open ? null : pathname)}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          <Link href={brand.links.dashboard} aria-label="LYRA, ir al inicio">
            <Logo compact ink />
          </Link>
          <span className="w-11" />
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
