import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { UpgradeWorkspace } from "@/components/plan/upgrade-workspace";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";

export const metadata: Metadata = {
  title: "Mejorar tu plan",
};

export default async function UpgradePage() {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);

  return (
    <>
      <PageHeader
        eyebrow="Membresías"
        title="Mejorar tu plan"
        description="Sube de nivel pagando solo la diferencia. Más créditos, más niveles de red y mejores comisiones desde el primer día."
        section="compensation"
      />
      <UpgradeWorkspace
        currentPackage={user.package ?? null}
        credits={user.credits ?? 0}
      />
    </>
  );
}
