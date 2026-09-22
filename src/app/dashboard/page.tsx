import type { Metadata } from "next";
import Link from "next/link";
import { Compass, Crown, PenLine, Target, Users, Wallet, Zap, type LucideIcon } from "lucide-react";

import { CreditKpi } from "@/components/dashboard/credit-kpi";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { brand } from "@/config/brand";
import { agents, countDirectAffiliates, demoUser, demoWallet } from "@/lib/demo-data";
import { formatCredits, formatUsd, rankLabel } from "@/lib/format";

export const metadata: Metadata = {
  title: "Dashboard",
};

const agentIcons: Record<string, LucideIcon> = {
  prospector: Target,
  copywriter: PenLine,
  closer: Zap,
  mentor: Compass,
};

export default function DashboardPage() {
  const featured = [...agents].sort((left, right) => right.uses - left.uses).slice(0, 3);

  return (
    <>
      <PageHeader
        eyebrow="Backoffice"
        title={`Hola, ${demoUser.name.split(" ")[0]}`}
        description="Comisiones, créditos y los agentes que más está usando tu línea."
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Comisiones totales"
          value={formatUsd(demoWallet.totalEarnedCommissions)}
          hint="Acumulado en la red"
          icon={Wallet}
        />
        <CreditKpi />
        <KpiCard
          label="Afiliados directos"
          value={formatCredits(countDirectAffiliates())}
          hint="Primera línea activa"
          icon={Users}
        />
        <KpiCard
          label="Rango actual"
          value={rankLabel[demoUser.rank]}
          hint="Abre cursos de líder"
          icon={Crown}
        />
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 className="text-sm uppercase tracking-[0.22em] text-zinc-400">Agentes más usados</h2>
          <Link href={brand.links.aiStudio} className="text-xs tracking-wide text-lyra-cyan">
            Ir al estudio
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {featured.map((agent) => {
            const Icon = agentIcons[agent.id] ?? Target;
            return (
              <Link
                key={agent.id}
                href={`${brand.links.aiStudio}?agent=${agent.id}`}
                className="rounded-2xl border border-lyra-border bg-lyra-card p-5 shadow-[0_0_15px_rgba(124,58,237,0.15)] transition-colors hover:border-lyra-cyan/40"
              >
                <Icon className="h-4 w-4 text-lyra-cyan" aria-hidden />
                <h3 className="mt-5 text-base text-white">{agent.name}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{agent.description}</p>
                <p className="mt-4 font-mono text-xs text-zinc-500">
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
