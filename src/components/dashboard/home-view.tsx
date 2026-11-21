import { HomeHero, NextSteps, RecentActivity, Shortcuts } from "@/components/dashboard/home-panels";
import { ReferralCard } from "@/components/dashboard/referral-card";
import type { HomeSummary } from "@/lib/dashboard/home";

export function HomeView({
  firstName,
  planLabel,
  referralLink,
  summary,
}: {
  firstName: string;
  planLabel: string;
  referralLink: string;
  summary: HomeSummary;
}) {
  return (
    <div className="space-y-5 sm:space-y-6">
      <HomeHero firstName={firstName} planLabel={planLabel} summary={summary} />

      <div className="grid w-full min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-5 lg:gap-6">
        <div className="min-w-0 lg:col-span-3">
          <ReferralCard
            link={referralLink}
            directs={summary.directs}
            joinedThisMonth={summary.joinedThisMonth}
            activeDirects={summary.activeDirects}
          />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <RecentActivity items={summary.activity} />
        </div>
      </div>

      <Shortcuts />
      <NextSteps steps={summary.steps} />
    </div>
  );
}
