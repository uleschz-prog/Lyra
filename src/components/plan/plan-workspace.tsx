"use client";

import { Check } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { PromoBadge, RebuyPromo } from "@/components/plan/rebuy-promo";
import { Progress } from "@/components/ui/progress";
import {
  bonusProfile,
  compensationPlan,
  getPackage,
  type BonusProfile,
  rebuyExemptionRule,
  signupPlans,
  type PackageId,
} from "@/config/compensation-plan";
import { estimateInvitationEarnings, type MemberPlanView } from "@/lib/compensation/engine";
import { formatCredits, formatUsd } from "@/lib/format";

const planVoice = {
  STARTED: "Notebook, academia y creación de video e imágenes.",
  PRO: "Todo lo de Started, con agentes autónomos.",
  FOUNDER: "Dueño de la red, con Lyra superagente.",
  CORPORATE: "El doble de créditos y 5,000 para activar a tu equipo.",
} as const;

const percent = (value: number) => `${Math.round(value * 100)}%`;
const rankLabel = (id: string) => compensationPlan.ranks.find((rank) => rank.id === id)?.label ?? id;

const bonusRows: { label: string; hint: string; value: (profile: BonusProfile) => string }[] = [
  { label: "Chispa", hint: "Inicio rápido sobre cada inscripción directa", value: (profile) => percent(profile.chispa) },
  {
    label: "Órbita",
    hint: `Residual ${compensationPlan.unilevel.map(percent).join(" / ")} sobre inscripciones y recompras`,
    value: (profile) => `${profile.orbitaLevels} niveles`,
  },
  {
    label: "Constelación",
    hint: "Cheque mensual por rango",
    value: (profile) => `×${profile.rankMultiplier} hasta ${rankLabel(profile.maxRank)}`,
  },
  { label: "Espejo", hint: "Sobre la Órbita de tus directos", value: (profile) => (profile.espejo ? percent(profile.espejo) : "—") },
  {
    label: "Fondo Galaxia",
    hint: `${percent(compensationPlan.galaxyPoolRate)} de los puntos globales desde rango Pulsar`,
    value: (profile) => (profile.galaxyPool ? "Participa" : "—"),
  },
];

export function PlanWorkspace({ plan }: { plan: MemberPlanView }) {
  const [directs, setDirects] = useState(4);
  const [invitesEach, setInvitesEach] = useState(2);
  const [salePackageId, setSalePackageId] = useState<PackageId>("STARTED");
  const earnerPackageId = plan.packageId ?? "STARTED";
  const estimate = useMemo(
    () =>
      estimateInvitationEarnings({
        directs,
        invitesEach,
        salePackageId,
        earnerPackageId,
      }),
    [directs, invitesEach, salePackageId, earnerPackageId],
  );
  const achieved = plan.rank.ranks.find((rank) => rank.id === plan.rank.achievedRankId);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-border bg-[#F4F1EC] p-6 backdrop-blur-xl sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-lyra-cyan">Tu membresía</p>
            <p className="mt-3 text-4xl text-[#1E1E24]">{plan.packageLabel}</p>
            <p className="mt-1 text-sm text-[#5C5854]">
              {plan.exempt ? plan.exemptLabel : `Recompra de ${formatUsd(plan.rebuyUsd)} al mes`}
            </p>
          </div>
          <Badge variant={plan.exempt ? "cyan" : "violet"}>
            {plan.exempt
              ? compensationPlan.exemptRebuyLabel
              : `${plan.activeDirects} de ${plan.requiredDirects} directos activos`}
          </Badge>
        </div>
        <p className="mt-4 text-sm leading-6 text-[#1E1E24]">{plan.message}</p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-[#1E1E24]">Poder de cómputo</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5C5854]">
          Started entra con $99, Pro con $499, Founder con $1,000 y Corporate con $5,000. Un crédito equivale a $1. La recompra corre al mes siguiente. {rebuyExemptionRule}
        </p>
        <div className="mt-6 grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-4">
          {signupPlans.map((planPackage) => {
            const corporate = planPackage.id === "CORPORATE";
            const founder = planPackage.id === "FOUNDER";
            const featured = founder || corporate;
            const promo = "rebuyBefore" in planPackage;
            const benefits = planPackage.points.filter(
              (point) => !/^[\d,]+ créditos de entrada|^Recarga mínima|^Mensualidad|^Libre de recompra/i.test(point),
            );
            return (
              <article
                key={planPackage.id}
                className={`relative row-span-8 grid grid-rows-subgrid gap-0 overflow-hidden rounded-[28px] p-5 transition-transform duration-300 hover:-translate-y-1 ${
                  corporate
                    ? "bg-gradient-to-b from-[#2A2A33] to-[#111114] text-white shadow-[0_24px_60px_-28px_rgba(17,17,20,0.9)] ring-1 ring-white/10"
                    : founder
                      ? "bg-gradient-to-b from-[#8B5CF6] to-[#5B21B6] text-white shadow-[0_24px_60px_-24px_rgba(124,58,237,0.75)]"
                      : "border border-[#E7E2DA] bg-white text-[#1E1E24] shadow-[0_18px_40px_-30px_rgba(30,30,36,0.35)]"
                }`}
              >
                {featured ? (
                  <span
                    aria-hidden
                    className={`pointer-events-none absolute -top-20 -right-16 h-48 w-48 rounded-full blur-3xl ${
                      corporate ? "bg-[#7C3AED]/35" : "bg-white/25"
                    }`}
                  />
                ) : null}

                <div className="relative flex h-7 items-center">
                  {founder ? (
                    <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium tracking-wide text-white ring-1 ring-white/20">
                      Mayor capacidad
                    </span>
                  ) : corporate ? (
                    <span className="rounded-full bg-gradient-to-r from-[#E9D5FF] to-[#C4B5FD] px-2.5 py-1 text-[11px] font-semibold tracking-wide text-[#2E1065]">
                      Recupera tu capital
                    </span>
                  ) : promo ? (
                    <PromoBadge />
                  ) : (
                    <span className="rounded-full bg-[#F4F1EC] px-2.5 py-1 text-[11px] font-medium tracking-wide text-[#5C5854]">
                      Para empezar
                    </span>
                  )}
                </div>

                <h3 className="relative mt-4 text-2xl font-semibold tracking-tight">{planPackage.label}</h3>
                <p className={`relative mt-1.5 text-sm leading-6 ${featured ? "text-white/75" : "text-[#5C5854]"}`}>
                  {planVoice[planPackage.id]}
                </p>

                <p className="relative mt-5 self-end text-[2.25rem] leading-none font-semibold tracking-tight whitespace-nowrap tabular-nums">
                  ${planPackage.price.toLocaleString("en-US")}
                </p>
                <p className={`relative mt-2 text-[11px] tracking-[0.18em] uppercase ${featured ? "text-white/60" : "text-[#8A8680]"}`}>
                  USD · pago único
                </p>

                <div
                  className={`relative mt-5 rounded-2xl px-4 py-3.5 ${
                    featured ? "bg-white/10 ring-1 ring-white/15" : "bg-[#F7F5F1] ring-1 ring-[#EFEAE3]"
                  }`}
                >
                  <p className={`text-sm font-semibold ${featured ? "text-white" : "text-[#7C3AED]"}`}>
                    {formatCredits(planPackage.credits)} créditos
                  </p>
                  {promo ? (
                    <RebuyPromo before={planPackage.rebuyBefore} now={planPackage.rebuy} className="mt-1.5 text-sm" />
                  ) : (
                    <p className={`mt-1.5 text-sm leading-6 ${featured ? "text-white/75" : "text-[#5C5854]"}`}>
                      {corporate
                        ? "Libre de recompra de por vida"
                        : "rebuyCredits" in planPackage
                          ? `Mensualidad de ${formatUsd(planPackage.rebuy)} con ${planPackage.rebuyCredits} créditos desde el mes siguiente`
                          : `Recarga mínima de ${formatUsd(planPackage.rebuy)} desde el mes siguiente`}
                    </p>
                  )}
                </div>

                <div className={`relative my-5 h-px ${featured ? "bg-white/15" : "bg-[#EFEAE3]"}`} />

                <ul className="relative space-y-3">
                  {benefits.map((point) => (
                    <li key={point} className="flex items-start gap-2.5 text-sm leading-6">
                      <span
                        className={`mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full ${
                          featured ? "bg-white/20" : "bg-[#7C3AED]/10"
                        }`}
                      >
                        <Check className={`h-3 w-3 ${featured ? "text-white" : "text-[#7C3AED]"}`} aria-hidden />
                      </span>
                      <span className={featured ? "text-white/90" : "text-[#1E1E24]"}>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-[#1E1E24]">{compensationPlan.name}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5C5854]">
          Tu equipo es el mismo. Tu paquete decide cuánto te toca. El pago total nunca pasa de{" "}
          {Math.round(compensationPlan.payoutCap * 100)}% de los puntos.
        </p>
        <div className="mt-5 overflow-x-auto rounded-3xl border border-[#E7E2DA] bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#E7E2DA] text-xs uppercase tracking-[0.14em] text-[#8A8680]">
                <th className="px-5 py-3 font-medium">Bono</th>
                {signupPlans.map((planPackage) => (
                  <th key={planPackage.id} className="px-5 py-3 font-medium">
                    {planPackage.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-[#1E1E24]">
              {bonusRows.map((row) => (
                <tr key={row.label} className="border-b border-[#F0ECE6] last:border-0">
                  <td className="px-5 py-3">
                    <p className="font-medium">{row.label}</p>
                    <p className="text-xs text-[#8A8680]">{row.hint}</p>
                  </td>
                  {signupPlans.map((planPackage) => {
                    const profile = bonusProfile(planPackage.id);
                    return (
                      <td key={planPackage.id} className="px-5 py-3 tabular-nums">
                        {profile ? row.value(profile) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-surface/80 backdrop-blur-md transition-colors hover:border-border-bright p-6 sm:p-8">
        <h2 className="text-lg font-bold tracking-tight text-[#1E1E24]">Calcula lo que ganas</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5C5854]">
          Elige el paquete de tus invitados. Tu plan {getPackage(earnerPackageId).label} define tu Chispa y hasta qué nivel cobras Órbita. Cada dólar genera 0.8 puntos.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {signupPlans.map((planPackage) => (
            <button
              key={planPackage.id}
              type="button"
              onClick={() => setSalePackageId(planPackage.id)}
              className={`rounded-full border px-3 py-1.5 text-xs tracking-wide ${
                salePackageId === planPackage.id
                  ? "border-accent-purple bg-accent-purple/15 text-[#1E1E24]"
                  : "border-border text-[#5C5854]"
              }`}
            >
              {planPackage.label} · {planPackage.rebuy > 0 ? `${formatUsd(planPackage.rebuy)} al mes` : "libre de recompra"}
            </button>
          ))}
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <label className="block text-sm text-[#5C5854]">
            Si invito a {directs} {directs === 1 ? "persona" : "personas"}
            <input
              type="range"
              min={1}
              max={20}
              value={directs}
              onChange={(event) => setDirects(Number(event.target.value))}
              className="mt-3 w-full accent-[#7C3AED]"
            />
          </label>
          <label className="block text-sm text-[#5C5854]">
            y cada una invita a {invitesEach} {invitesEach === 1 ? "persona" : "personas"}
            <input
              type="range"
              min={0}
              max={10}
              value={invitesEach}
              onChange={(event) => setInvitesEach(Number(event.target.value))}
              className="mt-3 w-full accent-[#7C3AED]"
            />
          </label>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label={`Chispa · ${Math.round(estimate.chispaRate * 100)}%`} value={formatUsd(estimate.chispa)} />
          <Metric label={`Órbita nivel 1 · ${Math.round(estimate.level1Rate * 100)}%`} value={formatUsd(estimate.level1)} />
          <Metric label={`Órbita nivel 2 · ${Math.round(estimate.level2Rate * 100)}%`} value={formatUsd(estimate.level2)} />
          <Metric label="Primer mes" value={formatUsd(estimate.total)} emphasis />
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[#1E1E24]">Bono Constelación</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5C5854]">
              Cheque mensual por rango. El volumen viene de al menos {plan.rank.minLegsRequired} líneas y cada línea
              cuenta hasta {Math.round(compensationPlan.maxLegVolumePercentage * 100)}% del rango. Tu paquete multiplica
              el cheque ×{plan.rank.multiplier}.
            </p>
          </div>
          {achieved ? (
            <Badge variant="violet">
              Rango {achieved.label} · cheque {formatUsd(achieved.payout)}
            </Badge>
          ) : null}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {plan.rank.ranks.map((rank, index) => (
            <article
              key={rank.id}
              className={`rounded-3xl border p-4 ${
                rank.id === plan.rank.achievedRankId
                  ? "border-accent-purple bg-accent-purple/10"
                  : "border-border bg-surface/80 backdrop-blur-md transition-colors hover:border-border-bright"
              }`}
            >
              <p className="text-[11px] tracking-[0.22em] text-[#7C3AED]">{"✦".repeat(index + 1)}</p>
              <h3 className="mt-3 text-base font-medium text-[#1E1E24]">{rank.label}</h3>
              <p className="mt-2 text-xl tabular-nums text-[#7C3AED]">
                {rank.locked ? "Bloqueado" : formatUsd(rank.payout)}
              </p>
              <p className="text-xs text-[#5C5854]">{formatCredits(rank.volume)} puntos al mes</p>
              <Progress className="mt-4" value={rank.locked ? 0 : rank.progress} />
              {rank.locked ? (
                <p className="mt-2 text-xs text-[#8A8680]">Sube de paquete para desbloquearlo</p>
              ) : (
                <p className="mt-2 text-xs text-[#7C3AED]">{rank.reached ? "Alcanzado" : `${Math.round(rank.progress)}%`}</p>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        emphasis ? "border-[#7C3AED]/30 bg-[#7C3AED]/10" : "border-border bg-[#F4F1EC]"
      }`}
    >
      <p className="text-[11px] uppercase tracking-[0.16em] text-[#8A8680]">{label}</p>
      <p className="mt-1 text-lg tabular-nums text-[#1E1E24]">{value}</p>
    </div>
  );
}
