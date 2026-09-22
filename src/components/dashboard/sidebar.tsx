"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { useCredits } from "@/components/dashboard/credit-provider";
import { brand } from "@/config/brand";
import { formatCredits, initials, rankLabel } from "@/lib/format";
import type { DemoUser } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Sidebar({ user, onClose }: { user: DemoUser; onClose?: () => void }) {
  const pathname = usePathname();
  const { balance } = useCredits();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 py-6">
        <Link href={brand.links.dashboard} className="inline-flex rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lyra-violet/70">
          <Logo />
        </Link>
        {onClose ? (
          <button
            type="button"
            aria-label="Cerrar menú"
            className="grid h-9 w-9 place-items-center rounded-xl border border-lyra-border text-zinc-300 lg:hidden"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <nav aria-label="Backoffice" className="flex-1 space-y-1 px-3">
        {brand.navigation.map((item) => {
          const active =
            item.href === brand.links.dashboard
              ? pathname === item.href
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-white/[0.04] text-white shadow-[0_0_15px_rgba(124,58,237,0.15)]"
                  : "text-zinc-400 hover:bg-white/[0.03] hover:text-white",
              )}
            >
              <Icon
                className={cn("h-4 w-4", active ? "text-lyra-violet" : "text-zinc-500")}
                aria-hidden
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <Link
        href={brand.links.wallet}
        className="m-3 rounded-2xl border border-lyra-border bg-lyra-card p-4 shadow-[0_0_15px_rgba(124,58,237,0.15)] transition-colors hover:border-white/15"
      >
        <span className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-lyra-violet/40 to-lyra-cyan/30 text-xs font-medium text-white">
            {initials(user.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm text-white">{user.name}</span>
            <span className="block text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              {rankLabel[user.rank]}
            </span>
          </span>
        </span>
        <span className="mt-4 block border-t border-lyra-border pt-3">
          <span className="block text-[10px] uppercase tracking-[0.22em] text-zinc-500">
            Créditos de IA
          </span>
          <span className="mt-1 block font-mono text-xl tabular-nums text-lyra-cyan">
            {formatCredits(balance)}
          </span>
        </span>
      </Link>
    </div>
  );
}
