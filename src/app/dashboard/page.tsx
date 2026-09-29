import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CreationHome } from "@/components/dashboard/creation-home";
import { HomeStats, NextSteps, RecentActivity, Shortcuts } from "@/components/dashboard/home-panels";
import { ReferralCard } from "@/components/dashboard/referral-card";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { homeSummary } from "@/lib/dashboard/home";
import { listProjects } from "@/lib/projects";

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

  const projects = await listProjects(user.id).catch(() => []);
  const summary = await homeSummary(user, projects.length);

  return (
    <>
      <CreationHome
        name={user.name.split(" ")[0] ?? user.name}
        projects={projects.map((project) => ({
          id: project.id,
          title: project.title,
          idea: project.idea,
          kind: project.kind,
        }))}
      />

      <div className="mt-16">
        <HomeStats summary={summary} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <ReferralCard
            link={referralLink}
            packageId={user.package}
            directs={summary.directs}
            joinedThisMonth={summary.joinedThisMonth}
          />
          <NextSteps steps={summary.steps} />
        </div>
        <div className="lg:col-span-2">
          <RecentActivity items={summary.activity} />
        </div>
      </div>

      <div className="mt-10">
        <Shortcuts />
      </div>
    </>
  );
}
