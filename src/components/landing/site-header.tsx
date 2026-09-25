"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Logo } from "@/components/brand/logo";
import { brand } from "@/config/brand";

const links = [
  { href: "#apps", label: "Apps" },
  { href: "#sitios", label: "Sitios web" },
  { href: "#agentes", label: "Agentes de IA", dot: true },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-[#F9F8F6]/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href={brand.links.home} aria-label="LYRA, ir al inicio" className="min-w-0" onClick={() => setOpen(false)}>
          <Logo ink />
        </Link>
        <nav aria-label="Principal" className="hidden items-center gap-6 lg:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-base text-[#1E1E24] transition-colors hover:text-black">
              {"dot" in link && link.dot ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#7C3AED]" />
                  {link.label}
                </span>
              ) : (
                link.label
              )}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href={brand.links.login} className="hidden text-base text-[#1E1E24] hover:text-black sm:inline">
            Inicia Sesión
          </Link>
          <Link
            href={brand.links.register}
            className="inline-flex items-center rounded-[6px] bg-[#312F2F] px-4 py-2.5 text-base font-medium text-white transition-colors hover:bg-[#1E1E24]"
          >
            Empieza a Construir
          </Link>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-[6px] text-[#1E1E24] lg:hidden"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {open ? (
        <nav aria-label="Móvil" className="border-t border-[#D9D5CE] bg-[#F9F8F6] px-4 py-3 lg:hidden">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block min-h-11 rounded-lg px-3 py-3 text-base text-[#1E1E24]"
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <Link href={brand.links.login} className="block min-h-11 rounded-lg px-3 py-3 text-base text-[#1E1E24]" onClick={() => setOpen(false)}>
            Inicia Sesión
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
