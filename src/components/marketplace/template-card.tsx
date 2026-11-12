import Link from "next/link";
import { AppWindow, Bot, Globe, Users } from "lucide-react";

import type { TemplateCard as Card } from "@/lib/marketplace/core";

const icons = { sitio: Globe, app: AppWindow, agente: Bot } as const;
const labels = { sitio: "Sitio web", app: "App", agente: "Agente" } as const;

export function PriceTag({ price }: { price: number }) {
  return price > 0 ? (
    <span className="rounded-full bg-[#FEF3C7] px-2.5 py-1 text-[11px] font-semibold text-[#92400E]">{price} créditos</span>
  ) : (
    <span className="rounded-full bg-[#D1FAE5] px-2.5 py-1 text-[11px] font-semibold text-[#065F46]">Gratis</span>
  );
}

/** Tarjeta del catálogo con miniatura en vivo (iframe aislado y escalado). */
export function TemplateCard({ template }: { template: Card }) {
  const Icon = icons[template.kind];
  return (
    <li className="group flex flex-col overflow-hidden rounded-2xl border border-[#E7E2DA] bg-white transition hover:-translate-y-0.5 hover:border-[#C4B5FD] dark:border-white/12 dark:bg-[#181625]">
      <Link href={`/dashboard/marketplace/${template.slug}`} className="relative block aspect-[16/10] overflow-hidden border-b border-[#F0ECE6] bg-[#F6F4F1] dark:border-white/10">
        <iframe
          title={`Miniatura de ${template.title}`}
          src={`/api/marketplace/${template.id}/preview`}
          sandbox="allow-scripts"
          loading="lazy"
          tabIndex={-1}
          aria-hidden
          referrerPolicy="no-referrer"
          className="pointer-events-none absolute left-0 top-0 h-[300%] w-[300%] origin-top-left scale-[0.3334] border-0 bg-white"
        />
        <span className="absolute inset-0" aria-hidden />
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EDE9FE] px-2.5 py-1 text-[11px] font-medium text-[#5B21B6] dark:bg-[#2B2740] dark:text-[#C4B5FD]">
            <Icon className="size-3.5" aria-hidden />
            {labels[template.kind]}
          </span>
          <PriceTag price={template.price} />
        </div>
        <Link href={`/dashboard/marketplace/${template.slug}`} className="mt-3 block">
          <h2 className="line-clamp-1 text-base font-semibold text-[#1E1E24] group-hover:text-[#7C3AED] dark:text-[#F2F0F7]">{template.title}</h2>
          <p className="mt-1 line-clamp-2 text-sm text-[#5C5854] dark:text-[#C8C4D4]">{template.summary}</p>
        </Link>
        <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-[#8A8680]">
          <span className="truncate">{template.authorName}</span>
          <span className="inline-flex shrink-0 items-center gap-1">
            <Users className="size-3.5" aria-hidden />
            {template.usesCount} {template.usesCount === 1 ? "uso" : "usos"}
          </span>
        </div>
      </div>
    </li>
  );
}
