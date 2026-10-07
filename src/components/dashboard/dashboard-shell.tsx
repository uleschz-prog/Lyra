"use client";

import { Bot, Home, Menu, Users, Wallet, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { Sidebar } from "@/components/dashboard/sidebar";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { brand } from "@/config/brand";
import type { AuthProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/dashboard", label: "Inicio", icon: Home },
  { href: "/dashboard/super-agent", label: "Vega", icon: Bot },
  { href: "/dashboard/wallet", label: "Billetera", icon: Wallet },
  { href: "/dashboard/network", label: "Red", icon: Users },
] as const;

function isActiveTab(href: string, pathname: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

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
    <div className="lyra-office min-h-screen overflow-x-hidden bg-[#F6F4F1] dark:bg-[#14121C]" style={{ backgroundImage: "none" }}>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-[min(85vw,260px)] border-r border-[#E7E2DA] bg-white transition-transform dark:border-white/12 dark:bg-[#181625] md:w-[248px] md:translate-x-0",
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
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 bg-[#F6F4F1] px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur dark:bg-[#14121C]/95 md:hidden">
          <button
            type="button"
            aria-label="Abrir menú"
            aria-expanded={open}
            className="grid h-11 w-11 place-items-center rounded-xl border border-[#E7E2DA] bg-white text-[#1E1E24] dark:border-white/12 dark:bg-[#181625] dark:text-[#F2F0F7]"
            onClick={() => setMenuPath(open ? null : pathname)}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          <Link href={brand.links.dashboard} aria-label="LYRA, ir al inicio">
            <Logo compact ink />
          </Link>
          <ThemeToggle />
        </header>
        <main className="mx-auto w-full min-w-0 max-w-6xl px-4 pt-4 pb-[calc(var(--lyra-tab)+1.5rem)] sm:px-6 sm:pt-8 md:pb-8 lg:px-10 lg:pt-10">{children}</main>
      </div>

      {/* Barra de pestañas inferior (solo móvil) */}
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-[#E7E2DA] bg-[#F6F4F1]/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg dark:border-white/10 dark:bg-[#14121C]/85 md:hidden"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActiveTab(tab.href, pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[3.25rem] min-w-16 flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 text-[11px] transition-colors",
                active ? "font-medium text-[#7C3AED] dark:text-[#A78BFA]" : "text-[#5C5854] dark:text-[#9B96AC]",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {tab.label}
            </Link>
          );
        })}
        <button
          type="button"
          className={cn(
            "flex min-h-[3.25rem] min-w-16 flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 text-[11px] transition-colors",
            open ? "font-medium text-[#7C3AED] dark:text-[#A78BFA]" : "text-[#5C5854] dark:text-[#9B96AC]",
          )}
          onClick={() => setMenuPath(open ? null : pathname)}
        >
          {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          Menú
        </button>
      </nav>
    </div>
  );
}
