import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { PublishForm } from "@/components/marketplace/publish-form";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { marketplaceRules } from "@/lib/marketplace/core";
import { listProjects } from "@/lib/projects/queries";

export const metadata: Metadata = { title: "Publicar plantilla" };
export const dynamic = "force-dynamic";

export default async function PublishPage({ searchParams }: { searchParams: Promise<{ proyecto?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);
  const [{ proyecto }, projects] = await Promise.all([searchParams, listProjects(user.id).catch(() => [])]);
  return (
    <div className="max-w-3xl">
      <Link href="/dashboard/marketplace" className="mb-4 inline-flex items-center gap-1.5 text-sm text-[#5C5854] hover:text-[#1E1E24] dark:text-[#C8C4D4]">
        <ArrowLeft className="size-4" aria-hidden />
        Marketplace
      </Link>
      <PageHeader eyebrow="Marketplace" title="Publicar plantilla" description="Comparte uno de tus proyectos como plantilla, gratis o por créditos. Se guarda una copia fija de la versión actual." />
      <PublishForm
        projects={projects.map((project) => ({ id: project.id, title: project.title, kind: project.kind, versionCount: project.versionCount, summary: project.summary }))}
        initialProjectId={proyecto}
        minPrice={marketplaceRules.minPrice}
        maxPrice={marketplaceRules.maxPrice}
        feePercent={marketplaceRules.feeRate * 100}
        holdDays={marketplaceRules.holdDays}
      />
    </div>
  );
}
