"use client";

import { Check } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { PromoBadge, RebuyPromo } from "@/components/plan/rebuy-promo";
import {
  bonusProfile,
  compensationPlan,
  rebuyExemptionRule,
  signupPlans,
  type PackageId,
} from "@/config/compensation-plan";
import { estimateInvitationEarnings, type MemberPlanView } from "@/lib/compensation/engine";
import { formatCredits, formatUsd } from "@/lib/format";
import type { PlanSpec } from "@/config/compensation-plan";

const planVoice = {
  STARTED: "Los mismos servicios. Cobras Órbita en 2 niveles y entras con 150 créditos.",
  PRO: "Los mismos servicios. Cobras Órbita en 4 niveles y entras con 300 créditos.",
  FOUNDER: "Los mismos servicios. Cobras Órbita en 6 niveles y entras con 1,000 créditos.",
} as const;

const percent = (value: number) => `${Math.round(value * 100)}%`;

export function PlanWorkspace({ plan }: { plan: MemberPlanView }) {
  const [directs, setDirects] = useState(4);
  const [invitesEach, setInvitesEach] = useState(2);
  const [salePackageId, setSalePackageId] = useState<PackageId>("STARTED");
  const earnerPackageId = (plan.packageId ?? "STARTED") as PackageId;
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
  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-border bg-[#F4F1EC] p-6 backdrop-blur-xl sm:p-8 dark:border-white/12 dark:bg-[#181625]">
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
              ? "Créditos bonus activos"
              : `${plan.activeDirects} de ${plan.requiredDirects} directos activos`}
          </Badge>
        </div>
        <p className="mt-4 text-sm leading-6 text-[#1E1E24]">{plan.message}</p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-[#1E1E24]">Poder de cómputo</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5C5854]">
          Inicio entra con $29 y 150 créditos, Negocio con $99 y 300, y Pro con $249 y 1,000. Todos incluyen los mismos servicios. Cambia hasta qué nivel cobras Órbita y cuántos créditos recibes. {rebuyExemptionRule}
        </p>
        <div className="mt-6 grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
          {signupPlans.map((planPackage: PlanSpec) => {
            const founder = planPackage.id === "FOUNDER";
            const featured = founder;
            const promo = "rebuyBefore" in planPackage;
            const benefits = planPackage.points.filter(
              (point) => !/^[\d,]+ créditos de entrada|^Recarga mínima|^Mensualidad|^Libre de recompra/i.test(point),
            );
            return (
              <article
                key={planPackage.id}
                className={`relative row-span-8 grid grid-rows-subgrid gap-0 overflow-hidden rounded-[28px] p-5 transition-transform duration-300 hover:-translate-y-1 ${
                  founder
                    ? "bg-gradient-to-b from-[#8B5CF6] to-[#5B21B6] text-white shadow-[0_24px_60px_-24px_rgba(124,58,237,0.75)]"
                    : "border border-[#E7E2DA] bg-white text-[#1E1E24] shadow-[0_18px_40px_-30px_rgba(30,30,36,0.35)] dark:border-white/12 dark:bg-[#181625] dark:text-[#F2F0F7]"
                }`}
              >
                {featured ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -top-20 -right-16 h-48 w-48 rounded-full bg-white/25 blur-3xl"
                  />
                ) : null}

                <div className="relative flex h-7 items-center">
                  {founder ? (
                    <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium tracking-wide text-white ring-1 ring-white/20">
                      Mayor capacidad
                    </span>
                  ) : promo ? (
                    <PromoBadge />
                  ) : (
                    <span className="rounded-full bg-[#F4F1EC] px-2.5 py-1 text-[11px] font-medium tracking-wide text-[#5C5854] dark:bg-[#221F30] dark:text-[#9B96AC]">
                      Para empezar
                    </span>
                  )}
                </div>

                <h3 className="relative mt-4 text-2xl font-semibold tracking-tight">{planPackage.label}</h3>
                <p className={`relative mt-1.5 text-sm leading-6 ${featured ? "text-white/75" : "text-[#5C5854]"}`}>
                  {planVoice[planPackage.id as keyof typeof planVoice]}
                </p>

                <p className="relative mt-5 self-end text-[2.25rem] leading-none font-semibold tracking-tight whitespace-nowrap tabular-nums">
                  ${planPackage.price.toLocaleString("en-US")}
                </p>
                <p className={`relative mt-2 text-[11px] tracking-[0.18em] uppercase ${featured ? "text-white/60" : "text-[#8A8680]"}`}>
                  USD · pago único
                </p>

                <div
                  className={`relative mt-5 rounded-2xl px-4 py-3.5 ${
                    featured ? "bg-white/10 ring-1 ring-white/15" : "bg-[#F7F5F1] ring-1 ring-[#EFEAE3] dark:bg-white/5 dark:ring-white/10"
                  }`}
                >
                  <p className={`text-sm font-semibold ${featured ? "text-white" : "text-[#7C3AED]"}`}>
                    {formatCredits(planPackage.credits)} créditos
                  </p>
                  {typeof planPackage.rebuyBefore === "number" ? (
                    <RebuyPromo before={planPackage.rebuyBefore} now={planPackage.rebuy} className="mt-1.5 text-sm" />
                  ) : (
                    <p className={`mt-1.5 text-sm leading-6 ${featured ? "text-white/75" : "text-[#5C5854]"}`}>
                      {typeof planPackage.rebuyCredits === "number"
                        ? `Mensualidad de ${formatUsd(planPackage.rebuy)} con ${planPackage.rebuyCredits} créditos desde el mes siguiente`
                        : `Recarga mínima de ${formatUsd(planPackage.rebuy)} desde el mes siguiente`}
                    </p>
                  )}
                </div>

                <div className={`relative my-5 h-px ${featured ? "bg-white/15" : "bg-[#EFEAE3] dark:bg-white/10"}`} />

                <ul className="relative space-y-3">
                  {benefits.map((point) => (
                    <li key={point} className="flex items-start gap-2.5 text-sm leading-6">
                      <span
                        className={`mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full ${
                          featured ? "bg-white/20" : "bg-[#7C3AED]/10 dark:bg-[#7C3AED]/25"
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
          El único bono es Órbita: 20%, 10% y 5% del nivel 3 al 6 sobre el dinero del paquete o de la recarga de créditos. Los seis niveles suman 50%. Tu paquete define hasta qué nivel cobras.
        </p>
        <div className="mt-5 overflow-x-auto rounded-3xl border border-[#E7E2DA] bg-white dark:border-white/12 dark:bg-[#181625]">
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
              <tr>
                <td className="px-5 py-3">
                  <p className="font-medium">Órbita</p>
                  <p className="text-xs text-[#8A8680]">
                    {compensationPlan.unilevel.map(percent).join(" / ")} del dinero pagado
                  </p>
                </td>
                {signupPlans.map((planPackage) => {
                  const profile = bonusProfile(planPackage.id);
                  return (
                    <td key={planPackage.id} className="px-5 py-3 tabular-nums">
                      {profile ? `${profile.orbitaLevels} niveles` : "—"}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-surface/80 backdrop-blur-md transition-colors hover:border-border-bright p-6 sm:p-8">
        <h2 className="text-lg font-bold tracking-tight text-[#1E1E24]">Calcula lo que ganas</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5C5854]">
          Elige el paquete de tus invitados. Tu plan {plan.packageLabel} cobra Órbita hasta el nivel {estimate.earnerLevels}, sobre el precio de entrada y la recarga.
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
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Metric label={`Órbita nivel 1 · ${Math.round(estimate.level1Rate * 100)}%`} value={formatUsd(estimate.level1)} />
          <Metric label={`Órbita nivel 2 · ${Math.round(estimate.level2Rate * 100)}%`} value={formatUsd(estimate.level2)} />
          <Metric label="Primer mes" value={formatUsd(estimate.total)} emphasis />
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
        emphasis ? "border-[#7C3AED]/30 bg-[#7C3AED]/10" : "border-border bg-[#F4F1EC] dark:border-white/12 dark:bg-[#181625]"
      }`}
    >
      <p className="text-[11px] uppercase tracking-[0.16em] text-[#8A8680]">{label}</p>
      <p className="mt-1 text-lg tabular-nums text-[#1E1E24]">{value}</p>
    </div>
  );
}
