import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { HomeView } from "@/components/dashboard/home-view";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { homeSummary } from "@/lib/dashboard/home";
import { packageLabel } from "@/lib/format";

export const metadata: Metadata = {
  title: "Inicio",
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);

  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const origin = process.env.NEXT_PUBLIC_APP_URL || (host ? `${proto}://${host}` : "");
  const referralLink = `${origin}/r/${user.username}`;
  const summary = await homeSummary(user);
  const firstName = user.name.split(/\s+/).filter(Boolean)[0] || user.name;

  return <HomeView firstName={firstName} planLabel={packageLabel[user.package]} referralLink={referralLink} summary={summary} />;
}
