import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { HomeStats, NextSteps, RecentActivity, Shortcuts } from "@/components/dashboard/home-panels";
import { ReferralCard } from "@/components/dashboard/referral-card";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { homeSummary } from "@/lib/dashboard/home";

export const metadata: Metadata = {
  title: "Dashboard",
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

  return (
    <>
      <div className="mt-2 sm:mt-4">
        <HomeStats summary={summary} />
      </div>

      <div className="mt-4 grid w-full min-w-0 grid-cols-1 items-start gap-4 lg:mt-6 lg:grid-cols-5 lg:gap-6">
        <div className="order-1 min-w-0 lg:col-span-3">
          <ReferralCard
            link={referralLink}
            packageId={user.package}
            directs={summary.directs}
            joinedThisMonth={summary.joinedThisMonth}
          />
        </div>
        <div className="order-2 min-w-0 lg:col-span-2 lg:row-span-2">
          <RecentActivity items={summary.activity} />
        </div>
        <div className="order-3 min-w-0 lg:col-span-3">
          <NextSteps steps={summary.steps} />
        </div>
      </div>

      <div className="mt-10">
        <Shortcuts />
      </div>
    </>
  );
}
