import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAddress } from "viem";

import { OnboardingFrame } from "@/components/onboarding/frame";
import { PayMembership } from "@/components/onboarding/pay-membership";
import { membershipAddress } from "@/config/membership";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Elige tu paquete" };

export default async function PagoPage() {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);
  if (user.role === "ADMIN" || user.package !== "NONE") redirect(brand.links.dashboard);
  if (!user.polygonWallet) redirect("/vincular");

  const sponsor = user.sponsorId
    ? await getPrisma().user.findUnique({ where: { id: user.sponsorId }, select: { polygonWallet: true } })
    : null;
  const sponsorWallet = sponsor?.polygonWallet && isAddress(sponsor.polygonWallet) ? sponsor.polygonWallet : null;

  return (
    <OnboardingFrame title="Elige tu paquete">
      <PayMembership wallet={user.polygonWallet} sponsor={sponsorWallet} membership={membershipAddress()} />
    </OnboardingFrame>
  );
}
