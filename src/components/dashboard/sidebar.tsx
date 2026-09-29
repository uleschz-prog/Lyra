"use client";

import { Gift, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { useCredits } from "@/components/dashboard/credit-provider";
import { UserNav } from "@/components/dashboard/user-nav";
import { brand, officeModes } from "@/config/brand";
import { formatCredits } from "@/lib/format";
import type { AuthProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

const agentRoots = officeModes[1].items.map((item) => item.href);

function isActive(href: string, pathname: string) {
  if (href === brand.links.dashboard) {
    return pathname === href || pathname.startsWith("/dashboard/projects");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ user, onClose }: { user: AuthProfile; onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { balance } = useCredits();
  const mode = agentRoots.some((href) => isActive(href, pathname)) ? officeModes[1] : officeModes[0];

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between px-4 pt-5">
        <Link
          href={brand.links.dashboard}
          aria-label="LYRA, ir al inicio"
          className="inline-flex rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/70"
        >
          <Logo ink />
        </Link>
        {onClose ? (
          <button
            type="button"
            aria-label="Cerrar menú"
            className="grid h-9 w-9 place-items-center rounded-xl text-[#5C5854] md:hidden"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="px-3 pt-5">
        <div className="grid grid-cols-2 rounded-full bg-[#EDE9FE] p-1" role="tablist" aria-label="Modo del backoffice">
          {officeModes.map((item) => {
            const selected = item.id === mode.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  onClose?.();
                  router.push(item.home);
                }}
                className={cn(
                  "rounded-full px-2 py-1.5 text-sm transition-colors",
                  selected ? "bg-white font-medium text-[#1E1E24] shadow-sm" : "text-[#6D28D9]",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <nav aria-label="Backoffice" className="mt-4 flex-1 space-y-1 overflow-y-auto px-3">
        {mode.items.map((item) => {
          const active = isActive(item.href, pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                active ? "bg-[#EDE9FE] text-[#1E1E24]" : "text-[#5C5854] hover:bg-[#F6F4F1] hover:text-[#1E1E24]",
              )}
            >
              <Icon className={cn("h-4 w-4", active ? "text-[#7C3AED]" : "text-[#8A8680]")} aria-hidden />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 p-3">
        {user.role === "ADMIN" ? (
          <Link
            href="/dashboard/admin"
            onClick={onClose}
            aria-current={isActive("/dashboard/admin", pathname) ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
              isActive("/dashboard/admin", pathname)
                ? "bg-[#1E1E24] text-white"
                : "bg-[#F6F4F1] text-[#1E1E24] hover:bg-[#EDE9FE]",
            )}
          >
            <ShieldCheck className="h-4 w-4 text-[#7C3AED]" aria-hidden />
            <span>Panel admin</span>
          </Link>
        ) : null}
        <Link
          href={brand.links.plan}
          onClick={onClose}
          className="flex items-center gap-3 rounded-2xl border border-[#E7E2DA] px-3 py-3 transition-colors hover:border-[#C4B5FD]"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-[#1E1E24]">Mejorar tu plan</span>
            <span className="mt-0.5 block text-xs text-[#8A8680]">Más créditos en Pro</span>
          </span>
          <Gift className="h-4 w-4 shrink-0 text-[#7C3AED]" aria-hidden />
        </Link>
        <div className="flex items-center gap-2 px-1 py-1">
          <UserNav user={user} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-[#1E1E24]">{user.name}</p>
            <p className="text-xs text-[#7C3AED]">{formatCredits(balance)} créditos</p>
          </div>
        </div>
      </div>
    </div>
  );
}
