import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { ModerationButtons } from "@/components/marketplace/moderation-buttons";
import { PriceTag } from "@/components/marketplace/template-card";
import { getCurrentUser } from "@/lib/auth/profile";
import { authorLabel } from "@/lib/marketplace/core";
import { marketDb } from "@/lib/marketplace/server";
import { formatProjectDate } from "@/lib/projects/store";

export const metadata: Metadata = { title: "Moderación del Marketplace" };
export const dynamic = "force-dynamic";

export default async function ModerationPage() {
  const admin = await getCurrentUser();
  if (admin?.role !== "ADMIN") redirect("/dashboard");
  const rows = await marketDb().marketplaceTemplate.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: { id: true, slug: true, title: true, kind: true, price: true, summary: true, official: true, createdAt: true, author: { select: { name: true, username: true } } },
  });
  return (
    <>
      <Link href="/dashboard/marketplace" className="mb-4 inline-flex items-center gap-1.5 text-sm text-[#5C5854] hover:text-[#1E1E24] dark:text-[#C8C4D4]">
        <ArrowLeft className="size-4" aria-hidden />
        Marketplace
      </Link>
      <PageHeader eyebrow="Admin" title="Moderación" description="Plantillas de socios en espera. Revisa la vista previa antes de aprobar: sin datos personales, llaves, contenido engañoso ni copias de terceros." />
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#D9D3CA] bg-white p-8 text-center text-sm text-[#5C5854] dark:border-white/12 dark:bg-[#181625] dark:text-[#C8C4D4]">No hay plantillas pendientes.</p>
      ) : (
        <ul className="divide-y divide-[#F0ECE6] rounded-2xl border border-[#E7E2DA] bg-white dark:divide-white/10 dark:border-white/12 dark:bg-[#181625]">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <Link href={`/dashboard/marketplace/${row.slug}`} className="font-medium text-[#1E1E24] hover:text-[#7C3AED] dark:text-[#F2F0F7]">{row.title}</Link>
                <p className="line-clamp-1 text-xs text-[#8A8680]">
                  {row.kind} · {authorLabel(row)} · {formatProjectDate(row.createdAt.toISOString())} · {row.summary}
                </p>
              </div>
              <PriceTag price={row.price} />
              <ModerationButtons id={row.id} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
