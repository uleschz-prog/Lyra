import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { brand } from "@/config/brand";

const columns = [
  {
    title: "Producto",
    links: [
      { href: "#apps", label: "Apps" },
      { href: "#sitios", label: "Sitios web" },
      { href: "#agentes", label: "Agentes de IA" },
      { href: "#planes", label: "Planes" },
    ],
  },
  {
    title: "Soluciones",
    links: [
      { href: brand.links.aiStudio, label: "Agentes de recepción" },
      { href: brand.links.studio, label: "Estudio creativo" },
      { href: brand.links.academy, label: "Academia" },
      { href: "#agentes", label: "Agentes de IA" },
    ],
  },
  {
    title: "Documentación",
    links: [
      { href: "#crear", label: "Builder" },
      { href: "#apps", label: "Apps" },
      { href: brand.links.wallet, label: "Créditos" },
    ],
  },
  {
    title: "Empresa",
    links: [
      { href: brand.links.login, label: "Inicia Sesión" },
      { href: brand.links.register, label: "Empieza a Construir" },
      { href: "#crear", label: "Qué vas a crear" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/legal/terminos", label: "Términos" },
      { href: "/legal/privacidad", label: "Privacidad" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-[#D9D5CE] bg-[#F9F8F6]">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <Link href={brand.links.home} aria-label="LYRA, ir al inicio" className="w-fit">
            <Logo ink mark="ENGINE" />
          </Link>
          <p className="inline-flex items-center gap-2 text-sm text-[#252525]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#7C3AED]" />
            Sistemas operativos
          </p>
        </div>
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {columns.map((column) => (
            <div key={column.title}>
              <p className="text-sm tracking-[0.14em] text-[#8A8680] uppercase">{column.title}</p>
              <ul className="mt-4 space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-base text-[#252525] hover:text-[#1E1E24]">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
