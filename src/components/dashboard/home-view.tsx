import { BusinessPulse, HomeHero, HomeSteps, ProjectShelf, StarterTemplates, TeamAgents } from "@/components/dashboard/home-panels";
import type { HomeSummary } from "@/lib/dashboard/home";

export function HomeView({
  firstName,
  planLabel,
  rankLabel,
  referralLink,
  walletBalance,
  summary,
}: {
  firstName: string;
  planLabel: string;
  rankLabel: string;
  referralLink: string;
  walletBalance: number;
  summary: HomeSummary;
}) {
  return (
    <div className="space-y-8 sm:space-y-10">
      <HomeHero firstName={firstName} referralLink={referralLink} canUseVega={summary.canUseVega} />

      <div className="grid w-full min-w-0 grid-cols-1 items-stretch gap-5 lg:grid-cols-5 lg:gap-6">
        <div className="min-w-0 lg:col-span-2">
          <BusinessPulse
            planLabel={planLabel}
            rankLabel={rankLabel}
            walletBalance={walletBalance}
            summary={summary}
          />
        </div>
        <div className="flex min-w-0 lg:col-span-3">
          <HomeSteps steps={summary.steps} projects={summary.projects} activeDirects={summary.activeDirects} canUseVega={summary.canUseVega} />
        </div>
      </div>

      <TeamAgents agents={summary.agents} canUseVega={summary.canUseVega} />
      <ProjectShelf projects={summary.projects} canUseVega={summary.canUseVega} />
      <StarterTemplates templates={summary.templates} />
    </div>
  );
}
