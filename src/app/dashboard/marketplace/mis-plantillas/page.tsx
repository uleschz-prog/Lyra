import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { UnpublishButton } from "@/components/marketplace/moderation-buttons";
import { PriceTag } from "@/components/marketplace/template-card";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { earningsSummary, marketplaceRules, releaseDueEarnings } from "@/lib/marketplace/core";
import { ledgerCredits, marketDb } from "@/lib/marketplace/server";
import { formatProjectDate } from "@/lib/projects/store";

export const metadata: Metadata = { title: "Mis plantillas" };
export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = { pending: "En revisión", approved: "Publicada", rejected: "Rechazada", unpublished: "Retirada" };

export default async function MyTemplatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);
  const db = marketDb();
  // Las ganancias que ya cumplieron la retención se liberan al abrir esta página (y en el cron diario).
  await releaseDueEarnings(db, ledgerCredits, { sellerId: user.id }).catch(() => null);
  const [rows, earnings] = await Promise.all([
    db.marketplaceTemplate.findMany({
      where: { authorId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, slug: true, title: true, kind: true, price: true, status: true, rejectReason: true, usesCount: true, salesCount: true, createdAt: true },
    }),
    earningsSummary(db, user.id),
  ]);
  return (
    <>
      <Link href="/dashboard/marketplace" className="mb-4 inline-flex items-center gap-1.5 text-sm text-[#5C5854] hover:text-[#1E1E24] dark:text-[#C8C4D4]">
        <ArrowLeft className="size-4" aria-hidden />
        Marketplace
      </Link>
      <PageHeader eyebrow="Marketplace" title="Mis plantillas" description={`Lo que publicaste y lo que has ganado. Las ventas se abonan en créditos ${marketplaceRules.holdDays} días después (LYRA retiene ${marketplaceRules.feeRate * 100}%).`} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#E7E2DA] bg-white p-5 dark:border-white/12 dark:bg-[#181625]">
          <p className="text-xs text-[#8A8680]">Por liberar (retenidos {marketplaceRules.holdDays} días)</p>
          <p className="mt-1 text-2xl font-semibold text-[#1E1E24] dark:text-[#F2F0F7]">{earnings.held} créditos</p>
        </div>
        <div className="rounded-2xl border border-[#E7E2DA] bg-white p-5 dark:border-white/12 dark:bg-[#181625]">
          <p className="text-xs text-[#8A8680]">Ya abonados a tu saldo</p>
          <p className="mt-1 text-2xl font-semibold text-[#1E1E24] dark:text-[#F2F0F7]">{earnings.released} créditos</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#D9D3CA] bg-white p-8 text-center text-sm text-[#5C5854] dark:border-white/12 dark:bg-[#181625] dark:text-[#C8C4D4]">
          Aún no publicas plantillas. <Link href="/dashboard/marketplace/publicar" className="text-[#7C3AED] underline">Publicar una</Link>
        </p>
      ) : (
        <ul className="divide-y divide-[#F0ECE6] rounded-2xl border border-[#E7E2DA] bg-white dark:divide-white/10 dark:border-white/12 dark:bg-[#181625]">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <Link href={`/dashboard/marketplace/${row.slug}`} className="font-medium text-[#1E1E24] hover:text-[#7C3AED] dark:text-[#F2F0F7]">{row.title}</Link>
                <p className="text-xs text-[#8A8680]">
                  {statusLabels[row.status] ?? row.status}
                  {row.rejectReason && row.status === "rejected" ? ` · ${row.rejectReason}` : ""} · {row.usesCount} {row.usesCount === 1 ? "uso" : "usos"} · {row.salesCount} {row.salesCount === 1 ? "venta" : "ventas"} · {formatProjectDate(row.createdAt.toISOString())}
                </p>
              </div>
              <PriceTag price={row.price} />
              {row.status !== "unpublished" ? <UnpublishButton id={row.id} /> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
