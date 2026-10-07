import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LinkWallet } from "@/components/onboarding/link-wallet";
import { OnboardingFrame } from "@/components/onboarding/frame";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";

export const metadata: Metadata = { title: "Vincula MetaMask" };

export default async function VincularPage() {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);
  if (user.role === "ADMIN" || user.package !== "NONE") redirect(brand.links.dashboard);

  return (
    <OnboardingFrame title="Vincula tu MetaMask">
      <LinkWallet saved={user.polygonWallet} />
    </OnboardingFrame>
  );
}
