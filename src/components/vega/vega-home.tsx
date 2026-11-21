"use client";

import { Grid2x2Plus, MessageSquarePlus, Plus, Search, Send, Sparkles, Star, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { VegaAgentSummary } from "@/app/dashboard/super-agent/actions";
import { AgentAvatar } from "@/components/vega/agent-avatar";
import { UserMenu } from "@/components/vega/user-menu";
import type { CostMeterView } from "@/lib/vega/cost-shared";
import { favoriteStorageKey, homeLayout, matchesAgent, relativeDay } from "@/lib/vega/home";
import { encodeMascot, type Mascot } from "@/lib/vega/mascot";
import { cn } from "@/lib/utils";

/** Plantillas para empezar un agente: solo rellenan el formulario, tú decides antes de guardar. */
export const agentTemplates: { key: string; title: string; text: string; mascot: Mascot; specialty: string; instructions: string }[] = [
  {
    key: "atencion",
    title: "Atención a clientes",
    text: "Responde dudas con el tono de tu marca.",
    mascot: { shape: "blob", color: "cyan" },
    specialty: "Atención a clientes",
    instructions:
      "Responde las dudas de mis clientes de forma breve, amable y con el tono de mi marca. Si no sabes algo, dilo con claridad y ofrece pasarme el caso.",
  },
  {
    key: "ventas",
    title: "Ventas",
    text: "Presenta tu oferta y resuelve objeciones.",
    mascot: { shape: "star", color: "amber" },
    specialty: "Ventas",
    instructions:
      "Presenta mi oferta con los datos que yo te dé, resuelve objeciones sin exagerar y pídeme confirmación antes de enviar cualquier liga de pago.",
  },
  {
    key: "seguimiento",
    title: "Seguimiento",
    text: "Te recuerda a quién escribir y prepara el mensaje.",
    mascot: { shape: "pill", color: "indigo" },
    specialty: "Seguimiento de clientes",
    instructions:
      "Lleva el seguimiento de mis prospectos y clientes: recuérdame a quién escribir y prepara mensajes cortos para que yo los apruebe antes de enviarlos.",
  },
];

export type AgentTemplateDraft = { name: string; specialty: string; instructions: string; avatar: string };

const focusRing = "focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0A10] focus-visible:outline-none";

/**
 * Inicio de Vega: tus agentes como una bandeja de mensajes. Arriba Vega y tu favorito (o el
 * más reciente), abajo los demás con su último mensaje, y al pie el buscador.
 */
export function VegaHome({
  agents,
  userName,
  busy,
  onOpenAgent,
  onCreateAgent,
  onNewVegaChat,
  onOpenLyraMenu,
  onOpenSettings,
  balance,
  tank,
  costMeter,
}: {
  agents: VegaAgentSummary[];
  userName: string;
  busy: boolean;
  onOpenAgent: (agent: VegaAgentSummary) => void;
  onCreateAgent: (template?: AgentTemplateDraft) => void;
  onNewVegaChat: () => void;
  onOpenLyraMenu: () => void;
  onOpenSettings: () => void;
  balance: number;
  tank: number;
  costMeter: CostMeterView | null;
}) {
  const [query, setQuery] = useState("");
  const [favoriteId, setFavoriteId] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setNow(new Date());
      try {
        setFavoriteId(localStorage.getItem(favoriteStorageKey));
      } catch {
        /* modo privado */
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!startOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStartOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startOpen]);

  function toggleFavorite(agent: VegaAgentSummary) {
    const next = favoriteId === agent.id ? null : agent.id;
    setFavoriteId(next);
    try {
      if (next) localStorage.setItem(favoriteStorageKey, next);
      else localStorage.removeItem(favoriteStorageKey);
    } catch {
      /* modo privado */
    }
  }

  const { main, companion, companionIsFavorite, rest } = homeLayout(agents, favoriteId);
  const searching = query.trim().length > 0;
  const results = searching ? [main, companion, ...rest].filter((agent): agent is VegaAgentSummary => Boolean(agent) && matchesAgent(agent!, query)) : rest;

  return (
    <section aria-labelledby="vega-home-title" className="relative flex min-h-0 flex-1 flex-col bg-[#0B0A10] text-white">
      <h1 id="vega-home-title" className="sr-only">
        Tus agentes
      </h1>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-xl px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-6 sm:px-6 md:pt-8">
          <header className="flex items-center justify-between">
            <UserMenu
              variant="home"
              userName={userName}
              balance={balance}
              tank={tank}
              costMeter={costMeter}
              onOpenSettings={onOpenSettings}
              onOpenLyraMenu={onOpenLyraMenu}
            />
            <button
              type="button"
              onClick={() => onCreateAgent()}
              disabled={busy}
              className={cn("grid size-11 place-items-center rounded-full bg-[#24212F] text-white transition hover:bg-[#2E2A3B] disabled:opacity-40", focusRing)}
              aria-label="Crear agente"
              title="Crear agente"
            >
              <Plus className="size-5" />
            </button>
          </header>

          {!searching ? (
            <ul className="mt-8 flex items-start justify-center gap-6 sm:mt-10 sm:gap-10" aria-label="Agentes destacados">
              {main ? (
                <HeroAgent agent={main} disabled={busy} onOpen={() => onOpenAgent(main)} />
              ) : null}
              {companion ? (
                <HeroAgent
                  agent={companion}
                  disabled={busy}
                  onOpen={() => onOpenAgent(companion)}
                  favorite={companionIsFavorite}
                  onToggleFavorite={() => toggleFavorite(companion)}
                />
              ) : (
                <li className="flex w-[118px] flex-col items-center sm:w-[140px]">
                  <button
                    type="button"
                    onClick={() => onCreateAgent()}
                    disabled={busy}
                    className={cn(
                      "grid size-[104px] place-items-center rounded-full border-2 border-dashed border-white/15 text-[#8E89A0] transition hover:border-[#A78BFA]/60 hover:text-white sm:size-[124px]",
                      focusRing,
                    )}
                    aria-label="Crear tu primer agente"
                  >
                    <Plus className="size-7" />
                  </button>
                  <span className="mt-2 text-sm text-[#8E89A0]">Nuevo agente</span>
                </li>
              )}
            </ul>
          ) : null}

          <div className={cn(searching ? "mt-6" : "mt-9 sm:mt-11")}>
            {results.length > 0 ? (
              <ul className="space-y-1" aria-label={searching ? "Resultados" : "Más agentes"}>
                {results.map((agent) => (
                  <AgentRow
                    key={agent.id}
                    agent={agent}
                    now={now}
                    disabled={busy}
                    favorite={favoriteId === agent.id}
                    onOpen={() => onOpenAgent(agent)}
                    onToggleFavorite={agent.isDefault ? undefined : () => toggleFavorite(agent)}
                  />
                ))}
              </ul>
            ) : searching ? (
              <p className="px-1 py-8 text-center text-sm text-[#8E89A0]">Ningún agente coincide con «{query.trim()}».</p>
            ) : (
              <div className="rounded-3xl bg-white/[0.03] px-5 py-7 text-center">
                <p className="text-sm font-medium text-white">Aún no tienes más agentes</p>
                <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-[#8E89A0]">
                  Crea uno para que atienda, venda o dé seguimiento por ti. Sus conversaciones aparecerán aquí.
                </p>
                <button
                  type="button"
                  onClick={() => setStartOpen(true)}
                  disabled={busy}
                  className={cn("mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#FFFFFF] px-4 py-2 text-sm font-medium text-[#0B0A10] transition hover:bg-[#EDE9FE] disabled:opacity-40", focusRing)}
                >
                  <Plus className="size-4" /> Crear agente
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-xl items-center gap-3 px-5 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 md:pb-6">
        <button
          type="button"
          onClick={() => setStartOpen(true)}
          disabled={busy}
          className={cn("grid size-[52px] shrink-0 place-items-center rounded-full bg-[#1C1A26] text-white transition hover:bg-[#24212F] disabled:opacity-40", focusRing)}
          aria-label="Empezar algo nuevo"
          aria-haspopup="dialog"
          aria-expanded={startOpen}
          title="Plantillas y agente nuevo"
        >
          <Grid2x2Plus className="size-5" />
        </button>
        <label className="flex h-[52px] min-w-0 flex-1 items-center gap-2.5 rounded-full bg-[#1C1A26] px-5 text-[#8E89A0] focus-within:ring-2 focus-within:ring-[#A78BFA]/60">
          <Search className="size-5 shrink-0" aria-hidden />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar"
            aria-label="Buscar agentes"
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-[#8E89A0]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
              className="grid size-7 place-items-center rounded-full text-[#8E89A0] hover:text-white"
              aria-label="Borrar búsqueda"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </label>
      </div>

      {startOpen ? (
        <StartSheet
          busy={busy}
          onClose={() => setStartOpen(false)}
          onBlank={() => {
            setStartOpen(false);
            onCreateAgent();
          }}
          onTemplate={(template) => {
            setStartOpen(false);
            onCreateAgent(template);
          }}
          onNewVegaChat={() => {
            setStartOpen(false);
            onNewVegaChat();
          }}
        />
      ) : null}
    </section>
  );
}

function HeroAgent({
  agent,
  disabled,
  onOpen,
  favorite = false,
  onToggleFavorite,
}: {
  agent: VegaAgentSummary;
  disabled: boolean;
  onOpen: () => void;
  favorite?: boolean;
  onToggleFavorite?: () => void;
}) {
  return (
    <li className="relative flex w-[118px] flex-col items-center sm:w-[140px]">
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className={cn("group flex w-full flex-col items-center rounded-[28px] pb-1 transition active:scale-[0.97] disabled:opacity-60", focusRing)}
        aria-label={`Abrir el chat con ${agent.name}${favorite ? " (favorito)" : ""}`}
      >
        <AgentAvatar agent={agent} className="size-[104px] transition group-hover:-translate-y-0.5 sm:size-[124px]" />
        <span className="mt-2 w-full truncate text-center text-sm text-[#8E89A0]">{agent.name}</span>
      </button>
      {onToggleFavorite ? (
        <button
          type="button"
          onClick={onToggleFavorite}
          className={cn(
            "absolute top-[76px] right-[8px] grid size-7 place-items-center rounded-full ring-[3px] ring-[#0B0A10] transition sm:top-[94px] sm:right-[12px]",
            favorite ? "bg-[#F59E0B] text-white" : "bg-[#24212F] text-[#8E89A0] hover:text-white",
            focusRing,
          )}
          aria-pressed={favorite}
          aria-label={favorite ? `Quitar a ${agent.name} de favoritos` : `Marcar a ${agent.name} como favorito`}
          title={favorite ? "Quitar de favoritos" : "Marcar como favorito"}
        >
          <Star className="size-3.5" fill={favorite ? "currentColor" : "none"} strokeWidth={2.2} />
        </button>
      ) : null}
    </li>
  );
}

function AgentRow({
  agent,
  now,
  disabled,
  favorite,
  onOpen,
  onToggleFavorite,
}: {
  agent: VegaAgentSummary;
  now: Date | null;
  disabled: boolean;
  favorite: boolean;
  onOpen: () => void;
  onToggleFavorite?: () => void;
}) {
  const when = now && agent.last ? relativeDay(agent.last.at, now) : "";
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className={cn("flex w-full items-center gap-3.5 rounded-3xl px-2 py-2.5 text-left transition hover:bg-white/[0.04] active:bg-white/[0.06] disabled:opacity-60", focusRing)}
        aria-label={`Abrir el chat con ${agent.name}`}
      >
        <AgentAvatar agent={agent} className="size-14" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1 truncate text-base font-semibold text-white">{agent.name}</span>
            {when ? (
              <time dateTime={agent.last?.at} className="shrink-0 text-xs text-[#8E89A0]">
                {when}
              </time>
            ) : null}
          </span>
          <span className={cn("mt-0.5 flex items-center gap-1.5 text-sm text-[#8E89A0]", onToggleFavorite && "pr-8")}>
            {agent.last?.fromUser ? (
              <>
                <Send className="size-3.5 shrink-0" aria-hidden />
                <span className="sr-only">Tú:</span>
              </>
            ) : null}
            <span className="min-w-0 truncate">{agent.last?.text || agent.specialty || "Sin mensajes todavía"}</span>
          </span>
        </span>
      </button>
      {onToggleFavorite ? (
        <button
          type="button"
          onClick={onToggleFavorite}
          className={cn(
            "absolute right-2 bottom-2.5 grid size-7 place-items-center rounded-full transition",
            favorite ? "text-[#F59E0B]" : "text-[#5E596E] hover:text-white md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100",
            focusRing,
          )}
          aria-pressed={favorite}
          aria-label={favorite ? `Quitar a ${agent.name} de favoritos` : `Marcar a ${agent.name} como favorito`}
          title={favorite ? "Quitar de favoritos" : "Marcar como favorito"}
        >
          <Star className="size-4" fill={favorite ? "currentColor" : "none"} />
        </button>
      ) : null}
    </li>
  );
}

function StartSheet({
  busy,
  onClose,
  onBlank,
  onTemplate,
  onNewVegaChat,
}: {
  busy: boolean;
  onClose: () => void;
  onBlank: () => void;
  onTemplate: (template: AgentTemplateDraft) => void;
  onNewVegaChat: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center sm:items-center" role="presentation">
      <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" aria-label="Cerrar" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vega-start-title"
        className="relative w-full max-w-md rounded-t-[28px] bg-[#16141F] px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white ring-1 ring-white/8 sm:rounded-[28px] sm:pb-5"
      >
        <div className="flex items-center justify-between">
          <h2 id="vega-start-title" className="text-base font-semibold">
            Empezar
          </h2>
          <button type="button" onClick={onClose} className={cn("grid size-9 place-items-center rounded-full text-[#8E89A0] hover:bg-white/10 hover:text-white", focusRing)} aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onBlank}
            disabled={busy}
            className={cn("flex items-center gap-2 rounded-2xl bg-[#FFFFFF] px-3.5 py-3 text-left text-sm font-medium text-[#0B0A10] transition hover:bg-[#EDE9FE] disabled:opacity-40", focusRing)}
          >
            <Plus className="size-4 shrink-0" /> Agente nuevo
          </button>
          <button
            type="button"
            onClick={onNewVegaChat}
            disabled={busy}
            className={cn("flex items-center gap-2 rounded-2xl bg-white/[0.06] px-3.5 py-3 text-left text-sm font-medium transition hover:bg-white/10 disabled:opacity-40", focusRing)}
          >
            <MessageSquarePlus className="size-4 shrink-0" /> Hablar con Vega
          </button>
        </div>
        <p className="mt-5 flex items-center gap-1.5 text-xs font-medium tracking-wide text-[#8E89A0] uppercase">
          <Sparkles className="size-3.5" aria-hidden /> Plantillas
        </p>
        <ul className="mt-2 space-y-1">
          {agentTemplates.map((template) => (
            <li key={template.key}>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  onTemplate({ name: template.title, specialty: template.specialty, instructions: template.instructions, avatar: encodeMascot(template.mascot) })
                }
                className={cn("flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-white/[0.05] disabled:opacity-40", focusRing)}
              >
                <AgentAvatar agent={{ id: template.key, name: template.title, isDefault: false, avatar: encodeMascot(template.mascot) }} className="size-11" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{template.title}</span>
                  <span className="block truncate text-xs text-[#8E89A0]">{template.text}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-[#6F6A80]">Las plantillas solo llenan el formulario: revisa y ajusta antes de guardar.</p>
      </div>
    </div>
  );
}
