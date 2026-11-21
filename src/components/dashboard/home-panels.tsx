"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  Coins,
  Crown,
  FolderKanban,
  Gift,
  Minus,
  Plus,
  Sparkles,
  Store,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { CountUp } from "@/components/dashboard/count-up";
import { useCredits } from "@/components/dashboard/credit-provider";
import { Sparkline } from "@/components/dashboard/sparkline";
import { VegaMascot } from "@/components/vega/vega-mark";
import { brand } from "@/config/brand";
import { greetingFor, groupActivityByDay, todayLabel, type ActivityGroup } from "@/lib/dashboard/home-logic";
import type { HomeActivity, HomeStep, HomeSummary } from "@/lib/dashboard/home";
import { formatCredits, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

const card =
  "rounded-[24px] border border-[#E8E4DC]/80 bg-white/80 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.78),0_1px_2px_rgba(16,12,32,0.04),0_10px_28px_-16px_rgba(76,29,149,0.28),0_28px_56px_-32px_rgba(16,12,32,0.18)] backdrop-blur-sm dark:border-white/10 dark:bg-[#1B1924]/85 dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_18px_50px_-32px_rgba(0,0,0,0.85)]";

export function HomeHero({
  firstName,
  planLabel,
  summary,
}: {
  firstName: string;
  planLabel: string;
  summary: HomeSummary;
}) {
  const { balance } = useCredits();
  const low = balance < 50;
  const greeting = greetingFor(firstName);
  const date = todayLabel();

  return (
    <section className={cn(card, "relative overflow-hidden px-5 py-7 sm:px-8 sm:py-8")}>
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_0%_0%,rgba(124,58,237,0.16),transparent_55%),radial-gradient(ellipse_at_100%_0%,rgba(6,182,212,0.12),transparent_48%)] dark:bg-[radial-gradient(ellipse_at_0%_0%,rgba(124,58,237,0.32),transparent_55%),radial-gradient(ellipse_at_100%_0%,rgba(6,182,212,0.16),transparent_48%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -top-16 -right-8 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(167,139,250,0.45),rgba(124,58,237,0.12)_45%,transparent_70%)] blur-2xl dark:bg-[radial-gradient(circle,rgba(124,58,237,0.55),rgba(76,29,149,0.18)_50%,transparent_70%)]"
        aria-hidden
      />

      <header className="relative flex items-start justify-between gap-4 sm:gap-8">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium tracking-[0.18em] text-[#8A8680] uppercase">{date}</p>
          <h1 className="mt-2 text-[2rem] leading-[1.1] font-bold tracking-tight text-[#1E1E24] sm:text-[2.7rem] dark:text-white">
            {greeting}
          </h1>
          <p className="mt-2 text-sm text-[#5C5854] dark:text-[#A9A3B8]">Plan {planLabel}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <Link
              href="/dashboard/super-agent"
              className="inline-flex items-center gap-2 rounded-2xl bg-[#7C3AED] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(124,58,237,0.9)] transition hover:-translate-y-0.5 hover:bg-[#6D28D9]"
            >
              <VegaMascot className="size-6" mood="happy" />
              Hablar con Vega
            </Link>
            <Link
              href="/dashboard/proyectos"
              className="inline-flex items-center gap-2 rounded-2xl border border-[#E7E2DA] bg-white/80 px-4 py-2.5 text-sm font-medium text-[#1E1E24] transition hover:-translate-y-0.5 hover:border-[#C4B5FD] dark:border-white/12 dark:bg-white/5 dark:text-white dark:hover:border-[#7C3AED]/50"
            >
              Crear proyecto
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
        <div className="relative shrink-0">
          <div
            className="absolute -inset-6 rounded-full bg-[conic-gradient(from_180deg_at_50%_50%,rgba(124,58,237,0.28),rgba(6,182,212,0.18),rgba(167,139,250,0.3),rgba(124,58,237,0.12))] blur-2xl"
            aria-hidden
          />
          <VegaMascot className="relative size-14 sm:size-[5.5rem] lg:size-28" mood="happy" />
        </div>
      </header>

      <div className="relative mt-7 grid grid-cols-1 items-stretch gap-3 sm:grid-cols-3">
        <Kpi
          href={brand.links.wallet}
          label="Comisiones del mes"
          value={<CountUp value={summary.commissionsMonth} format={formatUsd} className="tabular-nums" />}
          hint={`Acumulado ${formatUsd(summary.commissionsTotal)}`}
          icon={Wallet}
          tone="emerald"
          chart={<Sparkline points={summary.commissionsTrend} tone="emerald" label="Comisiones acumuladas de los últimos 14 días" />}
        />
        <Kpi
          href={brand.links.wallet}
          label="Créditos de IA"
          value={<CountUp value={balance} format={(n) => formatCredits(Math.round(n))} className="tabular-nums" />}
          hint={low ? "Saldo bajo · recarga en tu billetera" : "Disponibles para crear"}
          hintTone={low ? "warn" : "muted"}
          icon={Sparkles}
          tone="cyan"
          chart={<Sparkline points={summary.creditsTrend} tone="cyan" label="Movimiento acumulado de créditos de los últimos 14 días" />}
        />
        <Kpi
          href={brand.links.network}
          label="Tu red"
          value={
            <span className="tabular-nums">
              <CountUp value={summary.directs} format={(n) => formatCredits(Math.round(n))} />
            </span>
          }
          hint={
            summary.directs === 0
              ? "Todavía no tienes directos"
              : summary.joinedThisMonth > 0
                ? `directos · +${formatCredits(summary.joinedThisMonth)} este mes`
                : "directos · sin altas este mes"
          }
          icon={Users}
          tone="violet"
          chart={<Sparkline points={[]} tone="violet" label="Actividad de tu red" />}
        />
      </div>
    </section>
  );
}

function Kpi({
  href,
  label,
  value,
  hint,
  hintTone = "muted",
  icon: Icon,
  tone,
  chart,
}: {
  href: string;
  label: string;
  value: ReactNode;
  hint: string;
  hintTone?: "muted" | "warn";
  icon: LucideIcon;
  tone: "emerald" | "cyan" | "violet";
  chart: ReactNode;
}) {
  const icons = {
    emerald: "bg-[#D1FAE5] text-[#059669] dark:bg-[#059669]/20 dark:text-[#6EE7B7]",
    cyan: "bg-[#CFFAFE] text-[#0891B2] dark:bg-[#0891B2]/20 dark:text-[#67E8F9]",
    violet: "bg-[#EDE9FE] text-[#7C3AED] dark:bg-[#7C3AED]/20 dark:text-[#C4B5FD]",
  };

  return (
    <Link
      href={href}
      className="group flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[20px] border border-[#F0ECE6] bg-white/85 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8)] transition duration-200 hover:-translate-y-0.5 hover:border-[#C4B5FD] hover:shadow-[0_16px_32px_-24px_rgba(124,58,237,0.55)] dark:border-white/8 dark:bg-[#16141F]/85 dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] dark:hover:border-[#7C3AED]/50"
    >
      <div className="flex flex-1 flex-col px-4 pt-4 pb-2">
        <div className="flex items-center justify-between gap-2">
          <span className={cn("grid size-9 place-items-center rounded-2xl", icons[tone])}>
            <Icon className="size-4" aria-hidden />
          </span>
          <ArrowRight className="size-4 text-[#D4CFC8] transition group-hover:translate-x-0.5 group-hover:text-[#7C3AED] dark:text-white/25 dark:group-hover:text-[#C4B5FD]" aria-hidden />
        </div>
        <p className="mt-4 text-[11px] font-medium tracking-[0.16em] text-[#8A8680] uppercase">{label}</p>
        <p className="mt-1 text-[1.65rem] leading-none font-semibold tracking-tight text-[#1E1E24] dark:text-white">{value}</p>
        <p className={cn("mt-1.5 text-xs", hintTone === "warn" ? "font-medium text-[#B45309] dark:text-[#FBBF24]" : "text-[#5C5854] dark:text-[#A9A3B8]")}>{hint}</p>
      </div>
      <div className="mt-auto">{chart}</div>
    </Link>
  );
}

export function NextSteps({ steps }: { steps: HomeStep[] }) {
  const done = steps.filter((step) => step.done).length;
  if (done === steps.length) return null;
  const nextId = steps.find((step) => !step.done)?.id;

  return (
    <section className={cn(card, "p-5 sm:p-6")}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium tracking-[0.18em] text-[#7C3AED] uppercase dark:text-[#C4B5FD]">Tu ruta</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#1E1E24] dark:text-white">Siguientes pasos</h2>
        </div>
        <p className="text-sm text-[#5C5854] tabular-nums dark:text-[#A9A3B8]">
          {done} de {steps.length}
        </p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#F1EEE9] dark:bg-white/8">
        <div className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A78BFA]" style={{ width: `${Math.max(8, (done / Math.max(steps.length, 1)) * 100)}%` }} />
      </div>
      <ol className="mt-5 grid gap-2">
        {steps.map((step) => {
          const Wrapper = step.href.startsWith("#") ? "a" : Link;
          return (
            <li key={step.id}>
              <Wrapper
                href={step.href}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors",
                  step.done
                    ? "border-transparent bg-[#FAF8F5] dark:bg-white/4"
                    : step.id === nextId
                      ? "border-[#C4B5FD] bg-[#F5F3FF] hover:border-[#7C3AED] dark:border-[#7C3AED]/50 dark:bg-[#7C3AED]/15"
                      : "border-[#EFEBE5] hover:border-[#C4B5FD] dark:border-white/8 dark:hover:border-[#7C3AED]/40",
                )}
              >
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border",
                    step.done ? "border-[#10B981] bg-[#10B981] text-white" : "border-[#D9D5CE] text-transparent dark:border-white/20",
                  )}
                >
                  <Check className="size-3.5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm font-medium", step.done ? "text-[#8A8680] line-through" : "text-[#1E1E24] dark:text-white")}>{step.title}</span>
                  {step.done ? null : <span className="block text-xs text-[#5C5854] dark:text-[#A9A3B8]">{step.hint}</span>}
                </span>
                {step.done ? null : <ArrowRight className="size-4 shrink-0 text-[#7C3AED]" aria-hidden />}
              </Wrapper>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const activityIcons: Record<HomeActivity["kind"], { icon: LucideIcon; tone: string }> = {
  commission: { icon: TrendingUp, tone: "bg-[#D1FAE5] text-[#059669] dark:bg-[#059669]/20 dark:text-[#6EE7B7]" },
  credits: { icon: Plus, tone: "bg-[#CFFAFE] text-[#0891B2] dark:bg-[#0891B2]/20 dark:text-[#67E8F9]" },
  spend: { icon: Minus, tone: "bg-[#F1EEE9] text-[#5C5854] dark:bg-white/8 dark:text-[#C7C2D3]" },
  rebuy: { icon: Coins, tone: "bg-[#FEF3C7] text-[#B45309] dark:bg-[#B45309]/20 dark:text-[#FCD34D]" },
  adjustment: { icon: Gift, tone: "bg-[#EDE9FE] text-[#7C3AED] dark:bg-[#7C3AED]/20 dark:text-[#C4B5FD]" },
  referral: { icon: UserPlus, tone: "bg-[#EDE9FE] text-[#7C3AED] dark:bg-[#7C3AED]/20 dark:text-[#C4B5FD]" },
};

function visualFor(item: ActivityGroup) {
  if (item.title.startsWith("Vega ·") && item.title.includes("herramienta")) {
    return { icon: Wrench, tone: "bg-[#EDE9FE] text-[#7C3AED] dark:bg-[#7C3AED]/20 dark:text-[#C4B5FD]" };
  }
  if (item.title.startsWith("Vega")) {
    return { icon: Bot, tone: "bg-[#EDE9FE] text-[#7C3AED] dark:bg-[#7C3AED]/20 dark:text-[#C4B5FD]" };
  }
  return activityIcons[item.kind];
}

const relative = new Intl.RelativeTimeFormat("es-MX", { numeric: "auto" });

function ago(iso: string) {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

function amountLabel(item: ActivityGroup) {
  if (item.amount) {
    return {
      text: `${item.kind === "commission" ? "+" : ""}${formatUsd(item.amount)}`,
      className: item.kind === "commission" ? "text-[#059669] dark:text-[#6EE7B7]" : "text-[#1E1E24] dark:text-white",
    };
  }
  if (item.credits) {
    return {
      text: `${item.credits > 0 ? "+" : ""}${formatCredits(item.credits)} cr`,
      className: item.credits > 0 ? "text-[#0891B2] dark:text-[#67E8F9]" : "text-[#5C5854] dark:text-[#A9A3B8]",
    };
  }
  return null;
}

export function RecentActivity({ items }: { items: HomeActivity[] }) {
  const days = groupActivityByDay(items);

  return (
    <section className={cn(card, "flex h-full w-full min-w-0 flex-col p-4 sm:p-6")}>
      <div>
        <p className="text-[11px] font-medium tracking-[0.18em] text-[#8A8680] uppercase">Movimientos</p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#1E1E24] dark:text-white">Actividad reciente</h2>
      </div>
      {days.length === 0 ? (
        <p className="mt-6 flex-1 rounded-2xl bg-[#FAF8F5] px-4 py-8 text-center text-sm text-[#5C5854] dark:bg-white/4 dark:text-[#A9A3B8]">
          Aquí verás tus comisiones, créditos y a cada socio que se une a tu red.
        </p>
      ) : (
        <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
          {days.map((day) => (
            <section key={day.day} aria-labelledby={`act-${day.day}`}>
              <h3 id={`act-${day.day}`} className="text-[11px] font-medium tracking-[0.16em] text-[#8A8680] uppercase">
                {day.label}
              </h3>
              <ul className="mt-1.5 divide-y divide-[#F1EEE9] dark:divide-white/6">
                {day.items.map((item) => {
                  const { icon: Icon, tone } = visualFor(item);
                  const amount = amountLabel(item);
                  const row = (
                    <span className="flex min-w-0 items-center gap-3 py-3">
                      <span className={cn("grid size-9 shrink-0 place-items-center rounded-2xl", tone)}>
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-[#1E1E24] dark:text-white">{item.title}</span>
                        <span className="block text-xs text-[#8A8680]">
                          {item.count > 1 ? `${item.count} movimientos · ` : ""}
                          {ago(item.at)}
                        </span>
                      </span>
                      {amount ? <span className={cn("shrink-0 text-sm font-medium whitespace-nowrap tabular-nums", amount.className)}>{amount.text}</span> : null}
                    </span>
                  );
                  return (
                    <li key={item.id}>
                      {item.count > 1 ? (
                        <details className="group">
                          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{row}</summary>
                          <ul className="mb-2 ml-12 space-y-1 border-l border-[#EDE9FE] pl-3 dark:border-[#7C3AED]/30">
                            {item.items.map((entry) => (
                              <li key={entry.id} className="flex items-center justify-between gap-3 py-1 text-xs text-[#5C5854] dark:text-[#A9A3B8]">
                                <span className="truncate">{entry.title}</span>
                                <span className="shrink-0 tabular-nums">
                                  {entry.credits ? `${formatCredits(entry.credits)} cr` : ago(entry.at)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        row
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      <div className="mt-auto border-t border-[#F1EEE9] pt-4 dark:border-white/8">
        <Link
          href={brand.links.wallet}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#7C3AED] transition hover:gap-2 dark:text-[#C4B5FD]"
        >
          Ver todo el movimiento
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

const shortcuts = [
  { href: "/dashboard/super-agent", label: "Vega", hint: "Redacta, investiga y da seguimiento desde el chat.", icon: Crown },
  { href: "/dashboard/proyectos", label: "Proyectos", hint: "Sitios, apps y agentes que ya creaste o publicaste.", icon: FolderKanban },
  { href: "/dashboard/marketplace", label: "Marketplace", hint: "Plantillas listas para adaptar a tu negocio.", icon: Store },
  { href: "/dashboard/wallet", label: "Billetera", hint: "Comisiones, recargas y el historial de tu saldo.", icon: Wallet },
] as const;

export function Shortcuts() {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.18em] text-[#8A8680] uppercase">Accesos</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#1E1E24] dark:text-white">Herramientas</h2>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {shortcuts.map(({ href, label, hint, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              card,
              "group p-5 transition duration-200 hover:-translate-y-1 hover:border-[#C4B5FD] hover:shadow-[0_18px_36px_-20px_rgba(124,58,237,0.45)] dark:hover:border-[#7C3AED]/50",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-[#F5F3FF] text-[#7C3AED] transition duration-200 group-hover:bg-[#7C3AED] group-hover:text-white dark:bg-[#7C3AED]/20 dark:text-[#C4B5FD] dark:group-hover:bg-[#7C3AED] dark:group-hover:text-white">
                <Icon className="size-5" aria-hidden />
              </span>
              <ArrowRight className="size-4 text-[#D4CFC8] transition duration-200 group-hover:translate-x-0.5 group-hover:text-[#7C3AED] dark:text-white/25 dark:group-hover:text-[#C4B5FD]" aria-hidden />
            </div>
            <p className="mt-4 text-base font-semibold tracking-tight text-[#1E1E24] dark:text-white">{label}</p>
            <p className="mt-1 text-sm leading-6 text-[#5C5854] dark:text-[#A9A3B8]">{hint}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
