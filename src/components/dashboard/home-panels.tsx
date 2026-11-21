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
import { brand } from "@/config/brand";
import { greetingFor, groupActivityByDay, todayLabel, type ActivityGroup } from "@/lib/dashboard/home-logic";
import type { HomeActivity, HomeStep, HomeSummary } from "@/lib/dashboard/home";
import { formatCredits, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

const card =
  "rounded-[24px] border border-[#E8E4DC]/90 bg-white/85 shadow-[0_1px_2px_rgba(16,12,32,0.04),0_18px_44px_-28px_rgba(76,29,149,0.45)] backdrop-blur-sm dark:border-white/8 dark:bg-[#1B1924]/80 dark:shadow-[0_18px_50px_-32px_rgba(0,0,0,0.85)]";

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
    <section className={cn(card, "relative overflow-hidden px-5 py-6 sm:px-7 sm:py-7")}>
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_0%_0%,rgba(124,58,237,0.14),transparent_55%),radial-gradient(ellipse_at_100%_0%,rgba(6,182,212,0.10),transparent_50%)] dark:bg-[radial-gradient(ellipse_at_0%_0%,rgba(124,58,237,0.28),transparent_55%),radial-gradient(ellipse_at_100%_0%,rgba(6,182,212,0.12),transparent_50%)]"
        aria-hidden
      />
      <header className="relative">
        <p className="text-[11px] font-medium tracking-[0.18em] text-[#8A8680] uppercase">{date}</p>
        <h1 className="mt-1 text-[1.85rem] font-semibold tracking-tight text-[#1E1E24] sm:text-[2.35rem] dark:text-white">{greeting}</h1>
        <p className="mt-1.5 text-sm text-[#5C5854] dark:text-[#A9A3B8]">Plan {planLabel}</p>
      </header>

      <div className="relative mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi
          href={brand.links.wallet}
          label="Comisiones del mes"
          value={<CountUp value={summary.commissionsMonth} format={formatUsd} className="tabular-nums" />}
          hint={`Acumulado ${formatUsd(summary.commissionsTotal)}`}
          icon={Wallet}
          tone="emerald"
        >
          <Sparkline points={summary.commissionsTrend} tone="emerald" label="Comisiones de los últimos 14 días" />
        </Kpi>
        <Kpi
          href={brand.links.wallet}
          label="Créditos de IA"
          value={<CountUp value={balance} format={(n) => formatCredits(Math.round(n))} className="tabular-nums" />}
          hint={low ? "Saldo bajo · recarga en tu billetera" : "Disponibles para crear"}
          hintTone={low ? "warn" : "muted"}
          icon={Sparkles}
          tone="cyan"
        >
          <Sparkline points={summary.creditsTrend} tone="cyan" label="Movimiento de créditos de los últimos 14 días" />
        </Kpi>
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
  children,
}: {
  href: string;
  label: string;
  value: ReactNode;
  hint: string;
  hintTone?: "muted" | "warn";
  icon: LucideIcon;
  tone: "emerald" | "cyan" | "violet";
  children?: ReactNode;
}) {
  const icons = {
    emerald: "bg-[#D1FAE5] text-[#059669] dark:bg-[#059669]/20 dark:text-[#6EE7B7]",
    cyan: "bg-[#CFFAFE] text-[#0891B2] dark:bg-[#0891B2]/20 dark:text-[#67E8F9]",
    violet: "bg-[#EDE9FE] text-[#7C3AED] dark:bg-[#7C3AED]/20 dark:text-[#C4B5FD]",
  };

  return (
    <Link
      href={href}
      className="group flex min-w-0 flex-col rounded-[20px] border border-[#F0ECE6] bg-white/80 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[#C4B5FD] hover:shadow-[0_16px_32px_-24px_rgba(124,58,237,0.55)] dark:border-white/8 dark:bg-[#16141F]/80 dark:hover:border-[#7C3AED]/50"
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn("grid size-9 place-items-center rounded-2xl", icons[tone])}>
          <Icon className="size-4" aria-hidden />
        </span>
        <ArrowRight className="size-4 text-[#D4CFC8] transition group-hover:translate-x-0.5 group-hover:text-[#7C3AED] dark:text-white/25 dark:group-hover:text-[#C4B5FD]" aria-hidden />
      </div>
      <p className="mt-4 text-[11px] font-medium tracking-[0.16em] text-[#8A8680] uppercase">{label}</p>
      <p className="mt-1 text-[1.65rem] leading-none font-semibold tracking-tight text-[#1E1E24] dark:text-white">{value}</p>
      <p className={cn("mt-1.5 text-xs", hintTone === "warn" ? "font-medium text-[#B45309] dark:text-[#FBBF24]" : "text-[#5C5854] dark:text-[#A9A3B8]")}>{hint}</p>
      {children ? <div className="mt-3">{children}</div> : null}
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
    <section className={cn(card, "flex h-full min-h-[28rem] w-full min-w-0 flex-col p-4 sm:p-6")}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.18em] text-[#8A8680] uppercase">Movimientos</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#1E1E24] dark:text-white">Actividad reciente</h2>
        </div>
        <Link href={brand.links.wallet} className="text-xs font-medium text-[#7C3AED] hover:underline dark:text-[#C4B5FD]">
          Ver billetera
        </Link>
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
    </section>
  );
}

const shortcuts = [
  { href: "/dashboard/super-agent", label: "Vega", hint: "Redacta, investiga y da seguimiento desde el chat.", icon: Crown },
  { href: "/dashboard/proyectos", label: "Proyectos", hint: "Sitios, apps y agentes que ya creaste o publicaste.", icon: FolderKanban },
  { href: "/dashboard/marketplace", label: "Marketplace", hint: "Plantillas listas para adaptar a tu negocio.", icon: Store },
] as const;

export function Shortcuts() {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.18em] text-[#8A8680] uppercase">Accesos</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#1E1E24] dark:text-white">Herramientas</h2>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {shortcuts.map(({ href, label, hint, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              card,
              "group p-5 transition duration-200 hover:-translate-y-0.5 hover:border-[#C4B5FD] dark:hover:border-[#7C3AED]/50",
            )}
          >
            <span className="grid size-11 place-items-center rounded-2xl bg-[#F5F3FF] text-[#7C3AED] transition duration-200 group-hover:bg-[#7C3AED] group-hover:text-white dark:bg-[#7C3AED]/20 dark:text-[#C4B5FD] dark:group-hover:bg-[#7C3AED] dark:group-hover:text-white">
              <Icon className="size-5" aria-hidden />
            </span>
            <p className="mt-4 text-base font-semibold tracking-tight text-[#1E1E24] dark:text-white">{label}</p>
            <p className="mt-1 text-sm leading-6 text-[#5C5854] dark:text-[#A9A3B8]">{hint}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
