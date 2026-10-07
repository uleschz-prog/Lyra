import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { PlanWorkspace } from "@/components/plan/plan-workspace";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { memberPlan } from "@/lib/compensation/engine";
import { loadNetwork } from "@/lib/compensation/members";

export const metadata: Metadata = {
  title: "Partners",
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
        title="Partners"
        description="Activa Inicio, Negocio o Pro. El único bono es Órbita, sobre el paquete y sobre cada recarga de créditos."
        section="compensation"
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Compensación"
        title="Partners"
        description="Inicio, Negocio y Pro ofrecen los mismos servicios. Cambia hasta qué nivel cobras Órbita y cuántos créditos recibes."
        section="compensation"
      />
      <PlanWorkspace plan={plan} />
    </>
  );
}
