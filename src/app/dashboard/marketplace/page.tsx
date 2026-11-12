import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Search, ShieldCheck, Store, Upload } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { TemplateCard } from "@/components/marketplace/template-card";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { listTemplates } from "@/lib/marketplace/core";
import { ensureOfficialTemplates, marketDb } from "@/lib/marketplace/server";

export const metadata: Metadata = { title: "Marketplace" };
export const dynamic = "force-dynamic";

const kinds = [
  { value: "", label: "Todo" },
  { value: "sitio", label: "Sitios web" },
  { value: "app", label: "Apps" },
  { value: "agente", label: "Agentes" },
];
const prices = [
  { value: "", label: "Cualquier precio" },
  { value: "free", label: "Gratis" },
  { value: "paid", label: "Con créditos" },
];

function href(current: { kind?: string; price?: string; q?: string }, patch: Partial<{ kind: string; price: string; q: string }>) {
  const next = { ...current, ...patch };
  const params = new URLSearchParams(Object.entries(next).filter(([, value]) => value) as [string, string][]);
  const query = params.toString();
  return `/dashboard/marketplace${query ? `?${query}` : ""}`;
}

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<{ kind?: string; price?: string; q?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);
  const filters = await searchParams;
  await ensureOfficialTemplates();
  const db = marketDb();
  const [templates, pending] = await Promise.all([
    listTemplates(db, filters).catch(() => []),
    user.role === "ADMIN" ? db.marketplaceTemplate.count({ where: { status: "pending" } }).catch(() => 0) : Promise.resolve(0),
  ]);
  const chip = (active: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-sm transition ${
      active ? "border-[#7C3AED] bg-[#7C3AED] text-white" : "border-[#E7E2DA] bg-white text-[#1E1E24] hover:border-[#C4B5FD] dark:border-white/12 dark:bg-[#181625] dark:text-[#F2F0F7]"
    }`;

  return (
    <>
      <PageHeader
        eyebrow="Crear"
        title="Marketplace"
        description="Plantillas de sitios web, apps y agentes listas para usar. Elige una, cópiala a tus Proyectos y personalízala con Vega. También puedes publicar las tuyas."
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Link href="/dashboard/marketplace/publicar" className="inline-flex items-center gap-1.5 rounded-full bg-[#7C3AED] px-4 py-2 text-sm font-medium text-white">
          <Upload className="size-4" /> Publicar plantilla
        </Link>
        <Link href="/dashboard/marketplace/mis-plantillas" className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E2DA] bg-white px-4 py-2 text-sm font-medium text-[#1E1E24] dark:border-white/12 dark:bg-[#181625] dark:text-[#F2F0F7]">
          <Store className="size-4" /> Mis plantillas
        </Link>
        {user.role === "ADMIN" ? (
          <Link href="/dashboard/marketplace/moderacion" className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E2DA] bg-white px-4 py-2 text-sm font-medium text-[#1E1E24] dark:border-white/12 dark:bg-[#181625] dark:text-[#F2F0F7]">
            <ShieldCheck className="size-4" /> Moderación{pending ? ` (${pending})` : ""}
          </Link>
        ) : null}
      </div>

      <section aria-label="Filtros" className="mb-6 space-y-3">
        <form action="/dashboard/marketplace" className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8A8680]" aria-hidden />
          {filters.kind ? <input type="hidden" name="kind" value={filters.kind} /> : null}
          {filters.price ? <input type="hidden" name="price" value={filters.price} /> : null}
          <input
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Buscar: clínica, restaurante, CRM, WhatsApp…"
            aria-label="Buscar plantillas"
            className="w-full rounded-full border border-[#E7E2DA] bg-white py-2.5 pl-9 pr-4 text-sm text-[#1E1E24] outline-none focus:border-[#A78BFA] dark:border-white/12 dark:bg-[#181625] dark:text-[#F2F0F7]"
          />
        </form>
        <div className="flex flex-wrap gap-2">
          {kinds.map((option) => (
            <Link key={option.value} href={href(filters, { kind: option.value })} className={chip((filters.kind ?? "") === option.value)}>
              {option.label}
            </Link>
          ))}
          <span className="mx-1 hidden w-px bg-[#E7E2DA] sm:block" aria-hidden />
          {prices.map((option) => (
            <Link key={option.value} href={href(filters, { price: option.value })} className={chip((filters.price ?? "") === option.value)}>
              {option.label}
            </Link>
          ))}
        </div>
      </section>

      {templates.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#D9D3CA] bg-white p-8 text-center text-sm text-[#5C5854] dark:border-white/12 dark:bg-[#181625] dark:text-[#C8C4D4]">
          No hay plantillas con esos filtros. <Link href="/dashboard/marketplace" className="text-[#7C3AED] underline">Ver todas</Link>
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </ul>
      )}
    </>
  );
}
