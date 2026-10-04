import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Check,
  Coins,
  Crown,
  Gift,
  Minus,
  Plus,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { CreditStat } from "@/components/dashboard/credit-stat";
import { StatLink } from "@/components/dashboard/stat-link";
import { brand } from "@/config/brand";
import type { HomeActivity, HomeStep, HomeSummary } from "@/lib/dashboard/home";
import { formatCredits, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

function Bar({ value, tone = "violet" }: { value: number; tone?: "violet" | "emerald" }) {
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#F1EEE9]">
      <div
        className={cn("h-full rounded-full", tone === "emerald" ? "bg-[#10B981]" : "bg-gradient-to-r from-[#7C3AED] to-[#A78BFA]")}
        style={{ width: `${Math.max(4, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function HomeStats({ summary }: { summary: HomeSummary }) {
  const { rank } = summary;
  const directsProgress = (Math.min(summary.activeDirects, summary.exemptTarget) / summary.exemptTarget) * 100;

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Tu mes en LYRA">
      <StatLink href={brand.links.wallet} label="Comisiones del mes" icon={Wallet} tone="emerald">
        <p className="mt-2 text-2xl font-semibold text-[#1E1E24] tabular-nums">{formatUsd(summary.commissionsMonth)}</p>
        <p className="mt-1 text-xs text-[#5C5854]">Acumulado {formatUsd(summary.commissionsTotal)}</p>
      </StatLink>

      <CreditStat />

      <StatLink href={brand.links.network} label="Directos activos" icon={Users}>
        <p className="mt-2 text-2xl font-semibold text-[#1E1E24] tabular-nums">
          {summary.activeDirects}
          <span className="text-base font-normal text-[#8A8680]"> / {summary.exemptTarget}</span>
        </p>
        <Bar value={directsProgress} tone={summary.exempt ? "emerald" : "violet"} />
        <p className="mt-2 text-xs text-[#5C5854]">
          {summary.exempt
            ? "Créditos bonus activos este mes"
            : `${summary.exemptTarget - Math.min(summary.activeDirects, summary.exemptTarget)} más para créditos bonus`}
        </p>
      </StatLink>

      <StatLink href={brand.links.plan} label="Rango" icon={Crown} tone="amber">
        <p className="mt-2 text-2xl font-semibold text-[#1E1E24]">{rank.achieved ?? "En camino"}</p>
        {rank.next ? (
          <>
            <Bar value={rank.next.progress} />
            <p className="mt-2 text-xs text-[#5C5854]">
              {formatCredits(Math.round(rank.next.counted))} de {formatCredits(rank.next.volume)} pts para {rank.next.label}
              {rank.legs < rank.minLegs ? ` · ${rank.legs}/${rank.minLegs} líneas` : ""}
            </p>
          </>
        ) : (
          <p className="mt-1 text-xs text-[#5C5854]">Rango máximo de tu plan</p>
        )}
      </StatLink>
    </section>
  );
}

export function NextSteps({ steps }: { steps: HomeStep[] }) {
  const done = steps.filter((step) => step.done).length;
  if (done === steps.length) return null;
  const nextId = steps.find((step) => !step.done)?.id;

  return (
    <section className="rounded-2xl border border-[#E7E2DA] bg-white p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium tracking-[0.22em] text-[#7C3AED] uppercase">Tu ruta</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#1E1E24]">Siguientes pasos</h2>
        </div>
        <p className="text-sm text-[#5C5854] tabular-nums">
          {done} de {steps.length}
        </p>
      </div>
      <Bar value={(done / steps.length) * 100} />
      <ol className="mt-5 grid gap-2">
        {steps.map((step) => {
          const Wrapper = step.href.startsWith("#") ? "a" : Link;
          return (
            <li key={step.id}>
              <Wrapper
                href={step.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                  step.done
                    ? "border-transparent bg-[#FAF8F5]"
                    : step.id === nextId
                      ? "border-[#C4B5FD] bg-[#F5F3FF] hover:border-[#7C3AED]"
                      : "border-[#EFEBE5] hover:border-[#C4B5FD]",
                )}
              >
                <span
                  className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-full border",
                    step.done ? "border-[#10B981] bg-[#10B981] text-white" : "border-[#D9D5CE] text-transparent",
                  )}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm font-medium", step.done ? "text-[#8A8680] line-through" : "text-[#1E1E24]")}>
                    {step.title}
                  </span>
                  {step.done ? null : <span className="block text-xs text-[#5C5854]">{step.hint}</span>}
                </span>
                {step.done ? null : <ArrowRight className="h-4 w-4 shrink-0 text-[#7C3AED]" aria-hidden />}
              </Wrapper>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const activityIcons: Record<HomeActivity["kind"], { icon: LucideIcon; tone: string }> = {
  commission: { icon: TrendingUp, tone: "bg-[#D1FAE5] text-[#059669]" },
  credits: { icon: Plus, tone: "bg-[#CFFAFE] text-[#0891B2]" },
  spend: { icon: Minus, tone: "bg-[#F1EEE9] text-[#5C5854]" },
  rebuy: { icon: Coins, tone: "bg-[#FEF3C7] text-[#B45309]" },
  adjustment: { icon: Gift, tone: "bg-[#EDE9FE] text-[#7C3AED]" },
  referral: { icon: UserPlus, tone: "bg-[#EDE9FE] text-[#7C3AED]" },
};

const relative = new Intl.RelativeTimeFormat("es-MX", { numeric: "auto" });

function ago(iso: string) {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

export function RecentActivity({ items }: { items: HomeActivity[] }) {
  return (
    <section className="rounded-2xl border border-[#E7E2DA] bg-white p-6">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight text-[#1E1E24]">Actividad reciente</h2>
        <Link href={brand.links.wallet} className="text-xs text-[#7C3AED]">
          Ver billetera
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="mt-6 rounded-xl bg-[#FAF8F5] px-4 py-6 text-center text-sm text-[#5C5854]">
          Aquí verás tus comisiones, créditos y a cada socio que se une a tu red.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-[#F1EEE9]">
          {items.map((item) => {
            const { icon: Icon, tone } = activityIcons[item.kind];
            return (
              <li key={item.id} className="flex min-w-0 items-center gap-3 py-3">
                <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", tone)}>
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-[#1E1E24]">{item.title}</span>
                  <span className="block text-xs text-[#8A8680]">{ago(item.at)}</span>
                </span>
                {item.amount ? (
                  <span className={cn("shrink-0 text-sm font-medium whitespace-nowrap tabular-nums", item.kind === "commission" ? "text-[#059669]" : "text-[#1E1E24]")}>
                    {item.kind === "commission" ? "+" : ""}
                    {formatUsd(item.amount)}
                  </span>
                ) : item.credits ? (
                  <span className={cn("shrink-0 text-sm whitespace-nowrap tabular-nums", item.credits > 0 ? "text-[#0891B2]" : "text-[#5C5854]")}>
                    {item.credits > 0 ? "+" : ""}
                    {formatCredits(item.credits)} cr
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const shortcuts = [
  { href: "/dashboard/super-agent", label: "Vega", hint: "Tu super agente", icon: Crown },
  { href: "/dashboard/studio", label: "Estudio creativo", hint: "Video, imagen y voz", icon: Sparkles },
  { href: "/dashboard/notebook", label: "Notebook", hint: "Investiga tus fuentes", icon: BookOpen },
] as const;

export function Shortcuts() {
  return (
    <section>
      <h2 className="mb-4 text-sm font-bold tracking-tight text-[#1E1E24]">Herramientas</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {shortcuts.map(({ href, label, hint, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-2xl border border-[#E7E2DA] bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-[#C4B5FD]"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#F4F1EC] text-[#7C3AED] transition-colors group-hover:bg-[#7C3AED] group-hover:text-white">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <p className="mt-4 text-sm font-medium text-[#1E1E24]">{label}</p>
            <p className="mt-0.5 text-xs text-[#5C5854]">{hint}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
