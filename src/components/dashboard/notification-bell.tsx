"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/** Campana de notificaciones de la barra superior. */
export function NotificationBell({
  unread,
  onNavigate,
  className,
}: {
  unread: number;
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const href = brand.links.notifications;
  const active = pathname === href;
  const label = unread > 0 ? `Notificaciones, ${unread} sin leer` : "Notificaciones";
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-label={label}
      title="Notificaciones"
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#E7E2DA] bg-white text-[#5C5854] transition-colors hover:border-[#C4B5FD] hover:text-[#1E1E24] dark:border-white/12 dark:bg-[#181625] dark:text-[#C8C4D4]",
        active && "border-[#C4B5FD] text-[#7C3AED] dark:text-[#A78BFA]",
        className,
      )}
    >
      <Bell className="h-4 w-4" aria-hidden />
      {unread > 0 ? (
        <span className="absolute -top-1.5 -right-1.5 min-w-5 rounded-full bg-violet-700 px-1.5 py-0.5 text-center text-[10px] leading-none font-semibold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
