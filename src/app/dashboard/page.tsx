import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Crown, Users, Wallet } from "lucide-react";

import { agentIcons } from "@/components/ai-studio/agent-icons";
import { CreationHome } from "@/components/dashboard/creation-home";
import { CreditKpi } from "@/components/dashboard/credit-kpi";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ReferralCard } from "@/components/dashboard/referral-card";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { agents } from "@/lib/demo-data";
import { formatCredits, formatUsd, rankLabel } from "@/lib/format";
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

  const featured = [...agents].sort((left, right) => right.uses - left.uses).slice(0, 3);
  const projects = await listProjects(user.id).catch(() => []);

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
        <ReferralCard link={referralLink} packageId={user.package} />
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Comisiones totales"
          value={formatUsd(user.walletBalance)}
          hint="Acumulado en la red"
          icon={Wallet}
        />
        <CreditKpi />
        <KpiCard
          label="Afiliados directos"
          value={formatCredits(user.activeDirects)}
          hint="Primera línea con plan"
          icon={Users}
        />
        <KpiCard
          label="Rango actual"
          value={rankLabel[user.rank]}
          hint="Rango en la red"
          icon={Crown}
        />
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 className="text-sm font-bold tracking-tight text-[#1E1E24]">Agentes más usados</h2>
          <Link href={brand.links.aiStudio} className="text-xs tracking-wide text-[#7C3AED]">
            Ir al estudio
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {featured.map((agent) => {
            const Icon = agentIcons[agent.id] ?? Crown;
            return (
              <Link
                key={agent.id}
                href={`${brand.links.aiStudio}?agent=${agent.id}`}
                className="rounded-2xl border border-border bg-surface/80 p-5 backdrop-blur-md transition-colors hover:border-border-bright"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-[#F4F1EC] text-accent-purple">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <p className="mt-5 text-[10px] tracking-[0.18em] text-[#7C3AED] uppercase">{agent.star}</p>
                <h3 className="mt-1 font-semibold tracking-tight text-[#1E1E24]">{agent.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#5C5854]">{agent.description}</p>
                <p className="mt-4 text-xs text-[#7C3AED]">
                  {formatCredits(agent.uses)} usos · {agent.creditCost} créditos
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}
