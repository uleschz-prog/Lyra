"use client";

import { Brain, CalendarClock, ChevronLeft, ChevronRight, FolderOpen, History, LayoutDashboard, Pencil, Plug, ShieldCheck, User, X, type LucideIcon } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import type { VegaAgentSummary } from "@/app/dashboard/super-agent/actions";
import { AgentAvatar } from "@/components/vega/agent-avatar";
import { AutonomyPanel } from "@/components/vega/autonomy-panel";
import { ConnectionsPanel } from "@/components/vega/connections-panel";
import { CreditRing } from "@/components/vega/credit-ring";
import { FilesPanel } from "@/components/vega/files-panel";
import { HistoryPanel } from "@/components/vega/history-panel";
import { MemoryPanel } from "@/components/vega/memory-panel";
import { ProfilePanel } from "@/components/vega/profile-panel";
import { RoutinesPanel } from "@/components/vega/tasks-panel";
import { UsageMeter } from "@/components/vega/usage-meter";
import { formatCredits } from "@/lib/format";
import type { CostMeterView } from "@/lib/vega/cost-shared";
import { cn } from "@/lib/utils";

export type PaneTab = "resumen" | "rutinas" | "archivos" | "memoria" | "conexiones";

export const paneTabs: { id: PaneTab; label: string; icon: LucideIcon }[] = [
  { id: "resumen", label: "Resumen", icon: LayoutDashboard },
  { id: "rutinas", label: "Rutinas", icon: CalendarClock },
  { id: "archivos", label: "Archivos", icon: FolderOpen },
  { id: "memoria", label: "Memoria", icon: Brain },
  { id: "conexiones", label: "Conexiones", icon: Plug },
];

type Extra = "perfil" | "autonomia" | "historial";
const extras: { id: Extra; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "perfil", label: "Perfil del negocio", hint: "Tu negocio, metas y tono", icon: User },
  { id: "autonomia", label: "Autonomía", hint: "Lo que se ejecuta sin confirmar", icon: ShieldCheck },
  { id: "historial", label: "Historial de acciones", hint: "Confirmadas, canceladas o vencidas", icon: History },
];

/** Columna derecha de Vega v2: resumen del agente y los paneles de siempre, ahora fijos en pestañas. */
export function InfoPane({
  open,
  hidden,
  tab,
  agent,
  balance,
  tank,
  costMeter,
  scopeNote,
  renderTab,
  onTab,
  onClose,
  onEditAgent,
}: {
  open: boolean;
  hidden: boolean;
  tab: PaneTab;
  agent: VegaAgentSummary | undefined;
  balance: number;
  tank: number;
  costMeter: CostMeterView | null;
  /** Aviso de alcance (qué comparten los agentes). */
  scopeNote: string;
  /** Permite reemplazar el contenido de una pestaña (p. ej. paneles por agente). */
  renderTab?: (tab: PaneTab) => ReactNode | undefined;
  onTab: (tab: PaneTab) => void;
  onClose: () => void;
  onEditAgent: () => void;
}) {
  const [extra, setExtra] = useState<Extra | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const index = paneTabs.findIndex((item) => item.id === tab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % paneTabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + paneTabs.length) % paneTabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = paneTabs.length - 1;
    else return;
    event.preventDefault();
    onTab(paneTabs[next].id);
    tabRefs.current[next]?.focus();
  }

  const custom = renderTab?.(tab);
  let body: ReactNode;
  if (custom !== undefined) body = custom;
  else if (tab === "rutinas") body = <RoutinesPanel key={agent?.id ?? "all"} variant="pane" agentId={agent?.id} />;
  else if (tab === "archivos") body = <FilesPanel variant="pane" />;
  else if (tab === "memoria") body = <MemoryPanel key={agent?.id ?? "all"} variant="pane" agentId={agent?.id} agentName={agent?.name} />;
  else if (tab === "conexiones") body = <ConnectionsPanel variant="pane" />;
  else if (extra === "perfil") body = <ExtraView onBack={() => setExtra(null)}><ProfilePanel variant="pane" /></ExtraView>;
  else if (extra === "autonomia") body = <ExtraView onBack={() => setExtra(null)}><AutonomyPanel variant="pane" /></ExtraView>;
  else if (extra === "historial") body = <ExtraView onBack={() => setExtra(null)}><HistoryPanel variant="pane" /></ExtraView>;
  else {
    body = (
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
        <section className="relative overflow-hidden rounded-3xl border border-[#EEE9E2] bg-white p-4 dark:border-white/10 dark:bg-[#16131F]">
          <span
            className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(ellipse_at_15%_0%,rgba(124,58,237,0.25),transparent_60%),radial-gradient(ellipse_at_85%_10%,rgba(6,182,212,0.2),transparent_55%),radial-gradient(ellipse_at_50%_120%,rgba(16,185,129,0.12),transparent_60%)]"
            aria-hidden
          />
          <div className="relative flex items-center gap-3">
            <AgentAvatar agent={agent} className="size-14 text-2xl" ring />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-[#1E1E24] dark:text-white">{agent?.name ?? "Vega"}</p>
              <p className="truncate text-xs text-[#5C5854]">{agent?.specialty || "Asistente general"}</p>
            </div>
            <button
              type="button"
              onClick={onEditAgent}
              className="inline-flex items-center gap-1 rounded-full border border-[#E7E2DA] bg-white/80 px-2.5 py-1.5 text-xs font-medium text-[#1E1E24] hover:border-[#C4B5FD] focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none dark:border-white/15 dark:bg-white/5 dark:text-white"
            >
              <Pencil className="size-3" /> Editar
            </button>
          </div>
          <p className="relative mt-3 line-clamp-4 text-xs leading-5 text-[#5C5854]">
            {agent?.instructions?.trim() || "Sin instrucciones extra: responde con el tono general de Vega."}
          </p>
        </section>

        <section className="grid grid-cols-2 gap-2" aria-label="Créditos y uso">
          <div className="flex items-center gap-2.5 rounded-2xl border border-[#EEE9E2] bg-white p-3 dark:border-white/10 dark:bg-[#16131F]">
            <CreditRing balance={balance} tank={tank} size={30} />
            <div className="min-w-0">
              <p className="text-sm font-semibold tabular-nums text-[#1E1E24] dark:text-white">{formatCredits(balance)}</p>
              <p className="text-[11px] text-[#8A8680]">créditos</p>
            </div>
          </div>
          <div className="flex flex-col justify-center gap-1 rounded-2xl border border-[#EEE9E2] bg-white p-3 dark:border-white/10 dark:bg-[#16131F]">
            <p className="text-[11px] text-[#8A8680]">Uso de IA este mes</p>
            {costMeter && costMeter.level !== "unlimited" ? (
              <UsageMeter view={costMeter} className="self-start" />
            ) : (
              <p className="text-xs font-medium text-[#047857] dark:text-[#6EE7B7]">Sin tope en tu plan</p>
            )}
          </div>
        </section>

        <section aria-labelledby="vega-extras">
          <h3 id="vega-extras" className="mb-1.5 px-1 text-[11px] font-semibold tracking-[0.14em] text-[#8A8680] uppercase">
            Ajustes
          </h3>
          <ul className="overflow-hidden rounded-2xl border border-[#EEE9E2] bg-white dark:border-white/10 dark:bg-[#16131F]">
            {extras.map(({ id, label, hint, icon: Icon }) => (
              <li key={id} className="border-b border-[#F3EFEA] last:border-0 dark:border-white/6">
                <button
                  type="button"
                  onClick={() => setExtra(id)}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-[#FBFAF8] focus-visible:bg-[#F5F3FF] focus-visible:outline-none dark:hover:bg-white/4"
                >
                  <span className="grid size-8 place-items-center rounded-xl bg-[#F5F3FF] text-[#7C3AED] dark:bg-[#7C3AED]/15 dark:text-[#C4B5FD]">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[#1E1E24] dark:text-white">{label}</span>
                    <span className="block truncate text-[11px] text-[#8A8680]">{hint}</span>
                  </span>
                  <ChevronRight className="size-4 text-[#A8A29E]" />
                </button>
              </li>
            ))}
          </ul>
        </section>
        <p className="px-1 text-[11px] leading-5 text-[#8A8680]">{scopeNote}</p>
      </div>
    );
  }

  return (
    <aside
      id="vega-info"
      aria-label="Información del agente"
      className={cn(
        "fixed inset-x-0 bottom-[var(--lyra-tab)] z-50 flex h-[82dvh] flex-col rounded-t-3xl border-t border-[#EEE9E2] bg-[#FBFAF8] shadow-2xl transition-transform duration-200 dark:border-white/10 dark:bg-[#0F0D16]",
        "md:absolute md:inset-y-0 md:right-0 md:left-auto md:h-auto md:w-[380px] md:rounded-none md:border-t-0 md:border-l",
        "xl:static xl:z-auto xl:w-[360px] xl:translate-x-0 xl:shadow-none",
        open ? "translate-y-0 md:translate-x-0" : "invisible translate-y-full md:translate-x-full md:translate-y-0 xl:visible",
        hidden && "xl:hidden",
      )}
    >
      <span className="mx-auto mt-2 block h-1 w-10 rounded-full bg-[#E7E2DA] md:hidden dark:bg-white/15" aria-hidden />
      <div className="flex items-center gap-1 px-2 pt-2 pb-1">
        <div role="tablist" aria-label="Paneles de Vega" className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto" onKeyDown={onTabKey}>
          {paneTabs.map(({ id, label, icon: Icon }, index) => {
            const selected = id === tab;
            return (
              <button
                key={id}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                id={`vega-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="vega-tabpanel"
                tabIndex={selected ? 0 : -1}
                onClick={() => {
                  setExtra(null);
                  onTab(id);
                }}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none",
                  selected
                    ? "bg-[linear-gradient(135deg,#7C3AED,#6D28D9)] text-white shadow-[0_8px_18px_-10px_rgba(124,58,237,0.9)]"
                    : "text-[#5C5854] hover:bg-[#F3F0EB] dark:text-[#A9A3B8] dark:hover:bg-white/8",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                <span className={cn(!selected && "sr-only 2xl:not-sr-only")}>{label}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-[#8A8680] hover:bg-[#F3F0EB] hover:text-[#1E1E24] focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none dark:hover:bg-white/10"
          aria-label="Cerrar información"
        >
          <X className="size-4" />
        </button>
      </div>
      <div id="vega-tabpanel" role="tabpanel" aria-labelledby={`vega-tab-${tab}`} className="flex min-h-0 flex-1 flex-col">
        {body}
      </div>
    </aside>
  );
}

function ExtraView({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <button
        type="button"
        onClick={onBack}
        className="mx-3 mt-1 inline-flex items-center gap-1 self-start rounded-full px-2 py-1 text-xs font-medium text-[#7C3AED] hover:bg-[#F5F3FF] focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none dark:text-[#C4B5FD] dark:hover:bg-white/8"
      >
        <ChevronLeft className="size-3.5" /> Resumen
      </button>
      {children}
    </div>
  );
}
