import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { PlanWorkspace } from "@/components/plan/plan-workspace";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { memberPlan } from "@/lib/compensation/engine";
import { loadNetwork } from "@/lib/compensation/members";

export const metadata: Metadata = {
  title: "Partner",
};

export default async function PlanPage() {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);

  const { members } = await loadNetwork(user.id);
  const plan = memberPlan(members, user.id);

  if (!plan || !plan.packageId) {
    return (
      <PageHeader
        eyebrow="Compensación"
        title="Partner"
        description="Activa tu membresía Inicio, Negocio, Pro o Corporate para ver comisiones, rango y créditos."
        section="compensation"
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Compensación"
        title="Partner"
        description="Inicio, Negocio, Pro y Corporate. La recarga corre al mes siguiente; Corporate se cotiza y con 3 directos activos quedas exento."
        section="compensation"
      />
      <PlanWorkspace plan={plan} />
    </>
  );
}
