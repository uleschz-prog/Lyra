"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ExternalLink,
  FolderKanban,
  Plus,
  Sparkles,
  Wallet,
  Users,
} from "lucide-react";

import { CountUp } from "@/components/dashboard/count-up";
import { useCredits } from "@/components/dashboard/credit-provider";
import { InvitePill } from "@/components/dashboard/invite-pill";
import { Sparkline } from "@/components/dashboard/sparkline";
import { AgentAvatar } from "@/components/vega/agent-avatar";
import { VegaMascot } from "@/components/vega/vega-mark";
import { brand } from "@/config/brand";
import { activeDirectBonusCredits, compensationPlan } from "@/config/compensation-plan";
import { greetingFor, hasTrend, homeQuickActions, publishStatusLabel, sanitizeVegaDraft, todayLabel, vegaHref, type HomeStep } from "@/lib/dashboard/home-logic";
import type { HomeAgent, HomeProject, HomeSummary, HomeTemplate } from "@/lib/dashboard/home";
import { formatCredits, formatUsd } from "@/lib/format";
import { projectKindLabels } from "@/lib/projects/store";
import { cn } from "@/lib/utils";

const card =
  "rounded-[24px] border border-[#E8E4DC]/80 bg-white/80 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.78),0_1px_2px_rgba(16,12,32,0.04),0_10px_28px_-16px_rgba(76,29,149,0.28),0_28px_56px_-32px_rgba(16,12,32,0.18)] backdrop-blur-sm dark:border-white/10 dark:bg-[#1B1924]/85 dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_18px_50px_-32px_rgba(0,0,0,0.85)]";

export function HomeHero({ firstName, referralLink, canUseVega }: { firstName: string; referralLink: string; canUseVega: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const greeting = greetingFor(firstName);
  const date = todayLabel();

  function openVega(mensaje?: string) {
    const text = sanitizeVegaDraft(mensaje ?? draft);
    if (!canUseVega) {
      router.push("/dashboard/upgrade");
      return;
    }
    router.push(vegaHref({ mensaje: text || undefined }));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    openVega();
  }

  return (
    <section className={cn(card, "relative overflow-hidden px-5 py-7 sm:px-8 sm:py-9")}>
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_0%_0%,rgba(124,58,237,0.18),transparent_52%),radial-gradient(ellipse_at_100%_10%,rgba(6,182,212,0.14),transparent_46%)] dark:bg-[radial-gradient(ellipse_at_0%_0%,rgba(124,58,237,0.36),transparent_55%),radial-gradient(ellipse_at_100%_10%,rgba(6,182,212,0.18),transparent_48%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -top-20 right-0 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(167,139,250,0.5),rgba(124,58,237,0.14)_46%,transparent_70%)] blur-2xl dark:bg-[radial-gradient(circle,rgba(124,58,237,0.55),rgba(76,29,149,0.2)_50%,transparent_70%)]"
        aria-hidden
      />

      <header className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-[0.18em] text-[#8A8680] uppercase">{date}</p>
          <h1 className="mt-2 text-[2rem] leading-[1.08] font-bold tracking-tight text-[#1E1E24] sm:text-[2.75rem] dark:text-white">{greeting}</h1>
          <p className="mt-2 max-w-xl text-sm text-[#5C5854] sm:text-base dark:text-[#A9A3B8]">Hoy con Vega. Dile qué quieres construir o vender, y empieza desde aquí.</p>
        </div>
        <div className="flex shrink-0 items-start gap-3">
          <InvitePill link={referralLink} />
          <div className="relative hidden sm:block">
            <div className="absolute -inset-6 rounded-full bg-[conic-gradient(from_180deg_at_50%_50%,rgba(124,58,237,0.28),rgba(6,182,212,0.16),rgba(167,139,250,0.3),rgba(124,58,237,0.12))] blur-2xl" aria-hidden />
            <VegaMascot className="relative size-16 lg:size-[5.5rem]" mood="happy" />
          </div>
        </div>
      </header>

      <form onSubmit={onSubmit} className="relative mt-7">
        <label htmlFor="hoy-con-vega" className="sr-only">
          Escribe a Vega
        </label>
        <div className="flex flex-col gap-3 rounded-[28px] border border-[#E7E2DA]/90 bg-white/80 p-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9),0_18px_40px_-24px_rgba(76,29,149,0.45)] focus-within:border-[#C4B5FD] sm:flex-row sm:items-end dark:border-white/10 dark:bg-[#16141F]/80 dark:focus-within:border-[#7C3AED]/60">
          <textarea
            id="hoy-con-vega"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                openVega();
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder="Pídele a Vega un sitio, un agente, un texto de ventas…"
            className="min-h-[3.25rem] w-full resize-none bg-transparent px-3 py-2 text-base text-[#1E1E24] outline-none placeholder:text-[#8A8680] dark:text-white dark:placeholder:text-[#7A748C]"
          />
          <button
            type="submit"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#7C3AED] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(124,58,237,0.9)] transition hover:-translate-y-0.5 hover:bg-[#6D28D9]"
          >
            <VegaMascot className="size-5" mood="happy" />
            {canUseVega ? "Hablar con Vega" : "Activar Vega"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {homeQuickActions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => openVega(action.mensaje)}
              className="rounded-full border border-[#E7E2DA] bg-white/70 px-3 py-1.5 text-sm text-[#5C5854] transition hover:border-[#C4B5FD] hover:text-[#1E1E24] dark:border-white/10 dark:bg-white/5 dark:text-[#C7C2D3] dark:hover:border-[#7C3AED]/50 dark:hover:text-white"
            >
              {action.label}
            </button>
          ))}
        </div>
      </form>
    </section>
  );
}

export function BusinessPulse({
  planLabel,
  rankLabel,
  walletBalance,
  summary,
}: {
  planLabel: string;
  rankLabel: string;
  walletBalance: number;
  summary: HomeSummary;
}) {
  const { balance } = useCredits();
  const needed = compensationPlan.minActiveDirectsForBonus;
  const remaining = Math.max(needed - summary.activeDirects, 0);
  const progress = Math.min(100, Math.round((summary.activeDirects / Math.max(needed, 1)) * 100));

  return (
    <section className={cn(card, "flex h-full flex-col p-5 sm:p-6")}>
      <p className="text-[11px] font-medium tracking-[0.18em] text-[#8A8680] uppercase">Tu negocio</p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#1E1E24] dark:text-white">Pulso</h2>
      <p className="mt-1 text-sm text-[#5C5854] dark:text-[#A9A3B8]">
        Plan {planLabel} · {rankLabel}
      </p>

      <div className="mt-5 space-y-3">
        <Link href={brand.links.wallet} className="group block rounded-2xl bg-[#FAF8F5] px-4 py-3 transition hover:bg-[#F5F3FF] dark:bg-white/5 dark:hover:bg-[#7C3AED]/15">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-[#8A8680] uppercase">
              <Sparkles className="size-3.5 text-[#0891B2]" aria-hidden />
              Créditos
            </span>
            <ArrowRight className="size-3.5 text-[#D4CFC8] transition group-hover:text-[#7C3AED]" aria-hidden />
          </div>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-[#1E1E24] tabular-nums dark:text-white">
            <CountUp value={balance} format={(value) => formatCredits(Math.round(value))} />
          </p>
          {hasTrend(summary.creditsTrend) ? <Sparkline points={summary.creditsTrend} tone="cyan" label="Movimiento de créditos de los últimos 14 días" className="mt-1 h-8" /> : null}
        </Link>

        <Link href={brand.links.wallet} className="group block rounded-2xl bg-[#FAF8F5] px-4 py-3 transition hover:bg-[#F5F3FF] dark:bg-white/5 dark:hover:bg-[#7C3AED]/15">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-[#8A8680] uppercase">
              <Wallet className="size-3.5 text-[#059669]" aria-hidden />
              Comisiones
            </span>
            <ArrowRight className="size-3.5 text-[#D4CFC8] transition group-hover:text-[#7C3AED]" aria-hidden />
          </div>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-[#1E1E24] tabular-nums dark:text-white">
            <CountUp value={summary.commissionsMonth} format={formatUsd} />
          </p>
          <p className="mt-0.5 text-xs text-[#5C5854] dark:text-[#A9A3B8]">
            Este mes · acumulado {formatUsd(summary.commissionsTotal)}
            {walletBalance > 0 ? ` · saldo ${formatUsd(walletBalance)}` : ""}
          </p>
          {hasTrend(summary.commissionsTrend) ? <Sparkline points={summary.commissionsTrend} tone="emerald" label="Comisiones acumuladas de los últimos 14 días" className="mt-1 h-8" /> : null}
        </Link>

        <Link href={brand.links.network} className="group block rounded-2xl bg-[#FAF8F5] px-4 py-3 transition hover:bg-[#F5F3FF] dark:bg-white/5 dark:hover:bg-[#7C3AED]/15">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-[#8A8680] uppercase">
              <Users className="size-3.5 text-[#7C3AED]" aria-hidden />
              Tu red
            </span>
            <ArrowRight className="size-3.5 text-[#D4CFC8] transition group-hover:text-[#7C3AED]" aria-hidden />
          </div>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-[#1E1E24] tabular-nums dark:text-white">
            <CountUp value={summary.directs} format={(value) => formatCredits(Math.round(value))} />
            <span className="ml-2 text-sm font-medium text-[#5C5854] dark:text-[#A9A3B8]">directos</span>
          </p>
          <p className="mt-0.5 text-xs text-[#5C5854] dark:text-[#A9A3B8]">
            {summary.joinedThisMonth > 0 ? `+${formatCredits(summary.joinedThisMonth)} este mes · ` : "Sin altas este mes · "}
            {formatCredits(summary.activeDirects)} de {needed} activos
            {remaining === 0
              ? ` · cumples el mínimo del bono de ${formatCredits(activeDirectBonusCredits)} créditos`
              : ` para el bono`}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#EDE9FE] dark:bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A78BFA]" style={{ width: `${Math.max(progress === 0 ? 0 : 8, progress)}%` }} />
          </div>
        </Link>
      </div>
    </section>
  );
}

export function HomeSteps({
  steps,
  projects,
  activeDirects,
  canUseVega,
}: {
  steps: HomeStep[];
  projects: HomeProject[];
  activeDirects: number;
  canUseVega: boolean;
}) {
  const done = steps.filter((step) => step.done).length;
  const pending = steps.filter((step) => !step.done);
  const next = pending[0];
  const needed = compensationPlan.minActiveDirectsForBonus;
  const remainingDirects = Math.max(needed - activeDirects, 0);
  const draftProject = projects.find((project) => project.publishStatus !== "published");
  const moves: { id: string; title: string; hint: string; href: string }[] = [];
  if (remainingDirects > 0) {
    moves.push({
      id: "bonus",
      title: remainingDirects === 1 ? "Te falta 1 directo activo para el bono" : `Te faltan ${remainingDirects} directos activos para el bono`,
      hint: `Al llegar a ${needed}, hay un bono de ${formatCredits(activeDirectBonusCredits)} créditos por directo activo.`,
      href: "#invitar",
    });
  }
  if (draftProject) {
    moves.push({
      id: "draft",
      title: `Publica «${draftProject.title}»`,
      hint: "Está en borrador. Ábrelo cuando quieras dejarlo en línea.",
      href: `/dashboard/proyectos/${draftProject.id}`,
    });
  }
  if (canUseVega) {
    moves.push({
      id: "create",
      title: "Sigue creando con Vega",
      hint: "Un sitio nuevo, un texto de ventas o un agente más.",
      href: "/dashboard/super-agent",
    });
  }

  return (
    <section className={cn(card, "flex h-full w-full flex-col p-5 sm:p-6")}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.18em] text-[#7C3AED] uppercase dark:text-[#C4B5FD]">Para avanzar</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#1E1E24] dark:text-white">
            {pending.length ? "Siguiente paso" : "Siguiente movimiento"}
          </h2>
        </div>
        <p className="text-sm text-[#5C5854] tabular-nums dark:text-[#A9A3B8]">
          {done} de {steps.length} listos
        </p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#F1EEE9] dark:bg-white/8">
        <div className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A78BFA]" style={{ width: `${Math.max(steps.length ? 8 : 0, (done / Math.max(steps.length, 1)) * 100)}%` }} />
      </div>

      {pending.length ? (
        <ol className="mt-5 grid flex-1 content-start gap-2">
          {pending.map((step) => {
            const Wrapper = step.href.startsWith("#") ? "a" : Link;
            return (
              <li key={step.id}>
                <Wrapper
                  href={step.href}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors",
                    step.id === next?.id
                      ? "border-[#C4B5FD] bg-[#F5F3FF] hover:border-[#7C3AED] dark:border-[#7C3AED]/50 dark:bg-[#7C3AED]/15"
                      : "border-[#EFEBE5] hover:border-[#C4B5FD] dark:border-white/8 dark:hover:border-[#7C3AED]/40",
                  )}
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full border border-[#D9D5CE] dark:border-white/20" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[#1E1E24] dark:text-white">{step.title}</span>
                    <span className="block text-xs text-[#5C5854] dark:text-[#A9A3B8]">{step.hint}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-[#7C3AED]" aria-hidden />
                </Wrapper>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="mt-5 flex flex-1 flex-col gap-2">
          <p className="text-sm leading-6 text-[#5C5854] dark:text-[#A9A3B8]">Ya cubriste lo esencial. Estos son movimientos que puedes dar ahora.</p>
          {moves.map((move) => {
            const Wrapper = move.href.startsWith("#") ? "a" : Link;
            return (
              <Wrapper
                key={move.id}
                href={move.href}
                className="flex items-center gap-3 rounded-2xl border border-[#EDE9FE] bg-[#F5F3FF] px-4 py-3 transition hover:border-[#7C3AED] dark:border-[#7C3AED]/40 dark:bg-[#7C3AED]/15 dark:hover:border-[#A78BFA]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-[#1E1E24] dark:text-white">{move.title}</span>
                  <span className="block text-xs text-[#5C5854] dark:text-[#A9A3B8]">{move.hint}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-[#7C3AED]" aria-hidden />
              </Wrapper>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function TeamAgents({ agents, canUseVega }: { agents: HomeAgent[]; canUseVega: boolean }) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.18em] text-[#8A8680] uppercase">Tu equipo</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#1E1E24] dark:text-white">Agentes</h2>
        </div>
        <Link href="/dashboard/super-agent" className="inline-flex items-center gap-1 text-sm font-medium text-[#7C3AED] dark:text-[#C4B5FD]">
          Abrir Vega
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      {agents.length === 0 ? (
        <div className={cn(card, "flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center")}>
          <VegaMascot className="size-16 shrink-0" mood="happy" />
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-[#1E1E24] dark:text-white">Vega puede armar tu primer agente</p>
            <p className="mt-1 text-sm leading-6 text-[#5C5854] dark:text-[#A9A3B8]">Atención, ventas o seguimiento, con el tono de tu marca. Todavía no tienes agentes guardados.</p>
          </div>
          <Link
            href={canUseVega ? vegaHref({ mensaje: homeQuickActions[1].mensaje }) : "/dashboard/upgrade"}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#7C3AED] px-4 py-2.5 text-sm font-semibold text-white"
          >
            {canUseVega ? "Crear un agente" : "Activar Vega"}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {agents.map((agent) => (
            <Link
              key={agent.id}
              href={vegaHref({ agente: agent.id })}
              className={cn(
                card,
                "group flex flex-col p-5 transition duration-200 hover:-translate-y-1 hover:border-[#C4B5FD] dark:hover:border-[#7C3AED]/50",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <AgentAvatar agent={agent} className="size-14" />
                <ArrowUpRight className="size-4 text-[#D4CFC8] transition group-hover:text-[#7C3AED] dark:text-white/25" aria-hidden />
              </div>
              <p className="mt-4 truncate text-base font-semibold tracking-tight text-[#1E1E24] dark:text-white">{agent.name}</p>
              <p className="mt-0.5 truncate text-sm text-[#5C5854] dark:text-[#A9A3B8]">{agent.specialty || (agent.isDefault ? "Super agente" : "Agente")}</p>
              <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-xs leading-5 text-[#8A8680]">{agent.preview || "Sin mensajes todavía"}</p>
            </Link>
          ))}
          {canUseVega && agents.length < 4 ? (
            <Link
              href={vegaHref({ mensaje: homeQuickActions[1].mensaje })}
              className={cn(
                card,
                "group flex min-h-[11rem] flex-col items-start justify-center p-5 transition duration-200 hover:-translate-y-1 hover:border-[#C4B5FD] dark:hover:border-[#7C3AED]/50",
              )}
            >
              <span className="grid size-11 place-items-center rounded-2xl bg-[#F5F3FF] text-[#7C3AED] dark:bg-[#7C3AED]/20 dark:text-[#C4B5FD]">
                <Plus className="size-5" aria-hidden />
              </span>
              <p className="mt-4 text-base font-semibold text-[#1E1E24] dark:text-white">Nuevo agente</p>
              <p className="mt-1 text-sm text-[#5C5854] dark:text-[#A9A3B8]">Pídele a Vega uno de atención, ventas o seguimiento.</p>
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}

export function ProjectShelf({ projects, canUseVega }: { projects: HomeProject[]; canUseVega: boolean }) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.18em] text-[#8A8680] uppercase">Lo que has construido</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#1E1E24] dark:text-white">Proyectos</h2>
        </div>
        <Link href="/dashboard/proyectos" className="inline-flex items-center gap-1 text-sm font-medium text-[#7C3AED] dark:text-[#C4B5FD]">
          Ver todos
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      {projects.length === 0 ? (
        <div className={cn(card, "flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center")}>
          <span className="grid size-14 place-items-center rounded-2xl bg-[#F5F3FF] text-[#7C3AED] dark:bg-[#7C3AED]/20 dark:text-[#C4B5FD]">
            <FolderKanban className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-[#1E1E24] dark:text-white">Todavía no tienes proyectos</p>
            <p className="mt-1 text-sm leading-6 text-[#5C5854] dark:text-[#A9A3B8]">Pídele un sitio o una app a Vega, o parte de una plantilla del Marketplace.</p>
          </div>
          <Link
            href={canUseVega ? vegaHref({ mensaje: homeQuickActions[0].mensaje }) : "/dashboard/marketplace"}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#7C3AED] px-4 py-2.5 text-sm font-semibold text-white"
          >
            {canUseVega ? "Crear un sitio" : "Ver plantillas"}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-2">
          {projects.map((project) => {
            const status = publishStatusLabel(project.publishStatus);
            const live = status.tone === "live" && project.slug;
            return (
              <article key={project.id} className={cn(card, "flex h-full flex-col p-5 transition hover:border-[#C4B5FD] dark:hover:border-[#7C3AED]/50")}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[11px] font-medium tracking-[0.14em] text-[#8A8680] uppercase">{projectKindLabels[project.kind]}</p>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      status.tone === "live"
                        ? "bg-[#D1FAE5] text-[#047857] dark:bg-[#059669]/20 dark:text-[#6EE7B7]"
                        : status.tone === "off"
                          ? "bg-[#F1EEE9] text-[#5C5854] dark:bg-white/8 dark:text-[#C7C2D3]"
                          : "bg-[#EDE9FE] text-[#6D28D9] dark:bg-[#7C3AED]/20 dark:text-[#C4B5FD]",
                    )}
                  >
                    {status.label}
                  </span>
                </div>
                <h3 className="mt-3 text-base font-semibold tracking-tight text-[#1E1E24] dark:text-white">{project.title}</h3>
                <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm leading-6 text-[#5C5854] dark:text-[#A9A3B8]">{project.summary || "Sin descripción todavía."}</p>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                  <Link
                    href={`/dashboard/proyectos/${project.id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#7C3AED] px-3 py-2 text-sm font-medium text-white"
                  >
                    Abrir
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                  {live ? (
                    <a
                      href={`/s/${project.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#E7E2DA] bg-white/80 px-3 py-2 text-sm font-medium text-[#1E1E24] dark:border-white/10 dark:bg-white/5 dark:text-white"
                    >
                      Ver en vivo
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function StarterTemplates({ templates }: { templates: HomeTemplate[] }) {
  if (templates.length === 0) {
    return (
      <section>
        <div className="mb-4">
          <p className="text-[11px] font-medium tracking-[0.18em] text-[#8A8680] uppercase">Para empezar más rápido</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#1E1E24] dark:text-white">Plantillas</h2>
        </div>
        <div className={cn(card, "flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center")}>
          <p className="text-sm leading-6 text-[#5C5854] dark:text-[#A9A3B8]">Aún no hay plantillas publicadas en el Marketplace.</p>
          <Link href="/dashboard/marketplace" className="inline-flex items-center gap-1 text-sm font-medium text-[#7C3AED] dark:text-[#C4B5FD]">
            Ir al Marketplace
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.18em] text-[#8A8680] uppercase">Para empezar más rápido</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#1E1E24] dark:text-white">Plantillas</h2>
        </div>
        <Link href="/dashboard/marketplace" className="inline-flex items-center gap-1 text-sm font-medium text-[#7C3AED] dark:text-[#C4B5FD]">
          Marketplace
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", templates.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
        {templates.map((template) => (
          <Link
            key={template.id}
            href={`/dashboard/marketplace/${template.slug}`}
            className={cn(card, "group flex flex-col p-5 transition duration-200 hover:-translate-y-1 hover:border-[#C4B5FD] dark:hover:border-[#7C3AED]/50")}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium tracking-[0.14em] text-[#8A8680] uppercase">{projectKindLabels[template.kind]}</p>
              {template.official ? <span className="text-[11px] font-medium text-[#7C3AED] dark:text-[#C4B5FD]">Oficial</span> : null}
            </div>
            <p className="mt-3 text-base font-semibold tracking-tight text-[#1E1E24] dark:text-white">{template.title}</p>
            <p className="mt-1 line-clamp-2 flex-1 text-sm leading-6 text-[#5C5854] dark:text-[#A9A3B8]">{template.summary}</p>
            <p className="mt-4 text-sm font-medium text-[#1E1E24] dark:text-white">{template.price === 0 ? "Gratis" : `${formatCredits(template.price)} cr`}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
