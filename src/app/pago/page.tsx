import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingFrame } from "@/components/onboarding/frame";
import { PayMembership } from "@/components/onboarding/pay-membership";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";

export const metadata: Metadata = { title: "Elige tu paquete" };

export default async function PagoPage() {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);
  if (user.role === "ADMIN" || user.package !== "NONE") redirect(brand.links.dashboard);

  return (
    <OnboardingFrame title="Elige tu paquete">
      <PayMembership />
    </OnboardingFrame>
  );
}
