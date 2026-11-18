"use client";

import { LayoutGrid, MessageSquarePlus, PanelLeftClose, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useState } from "react";

import type { VegaAgentSummary, VegaChatSummary } from "@/app/dashboard/super-agent/actions";
import { AgentAvatar } from "@/components/vega/agent-avatar";
import { cn } from "@/lib/utils";

const iconButton =
  "grid size-9 place-items-center rounded-full text-[#6B6760] transition hover:bg-black/[0.05] hover:text-[#1E1E24] focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none disabled:opacity-40 dark:text-[#A9A3B8] dark:hover:bg-white/10 dark:hover:text-white";

const PINNED = 3;

function matches(query: string, ...values: (string | null | undefined)[]) {
  if (!query) return true;
  const needle = query.toLocaleLowerCase("es-MX");
  return values.some((value) => value?.toLocaleLowerCase("es-MX").includes(needle));
}

/**
 * Columna izquierda de Vega v2: buscar, tus agentes principales en mosaicos, los demás en
 * lista con su último mensaje, las conversaciones del agente activo y tu ficha (menú de LYRA).
 */
export function AgentSidebar({
  open,
  hidden,
  busy,
  agents,
  activeAgentId,
  chats,
  activeChatId,
  userName,
  onClose,
  onCollapse,
  onNewChat,
  onSelectAgent,
  onCreateAgent,
  onEditAgent,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
  onOpenLyraMenu,
}: {
  open: boolean;
  hidden: boolean;
  busy: boolean;
  agents: VegaAgentSummary[];
  activeAgentId: string;
  chats: VegaChatSummary[];
  activeChatId: string | null;
  userName: string;
  onClose: () => void;
  onCollapse: () => void;
  onNewChat: () => void;
  onSelectAgent: (agent: VegaAgentSummary) => void;
  onCreateAgent: () => void;
  onEditAgent: (agent: VegaAgentSummary) => void;
  onSelectChat: (id: string) => void;
  onRenameChat: (chat: VegaChatSummary) => void;
  onDeleteChat: (id: string) => void;
  onOpenLyraMenu: () => void;
}) {
  const [query, setQuery] = useState("");
  const activeAgent = agents.find((agent) => agent.id === activeAgentId);
  const pinned = agents.slice(0, PINNED);
  const others = agents.slice(PINNED).filter((agent) => matches(query, agent.name, agent.specialty, agent.preview));
  const visibleChats = chats.filter((chat) => matches(query, chat.title));
  const initials = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "TÚ";

  return (
    <aside
      id="vega-agents"
      aria-label="Agentes y conversaciones"
      className={cn(
        "fixed top-0 bottom-[var(--lyra-tab)] left-0 z-50 flex w-[min(88vw,320px)] flex-col bg-[#F4F3F0] pt-[env(safe-area-inset-top)] transition-transform duration-200 md:static md:z-auto md:w-[300px] md:translate-x-0 md:bg-transparent md:pt-0 dark:bg-[#121019] md:dark:bg-transparent",
        open ? "translate-x-0 shadow-2xl md:shadow-none" : "-translate-x-full",
        hidden && "md:hidden",
      )}
    >
      <div className="flex items-center gap-1.5 px-3 pt-3 pb-2">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-3.5 text-[#8A8680] ring-1 ring-black/[0.04] focus-within:ring-2 focus-within:ring-[#7C3AED]/40 dark:bg-white/[0.06] dark:ring-white/5">
          <Search className="size-4 shrink-0" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar"
            aria-label="Buscar agentes y conversaciones"
            className="min-w-0 flex-1 bg-transparent text-base text-[#1E1E24] outline-none placeholder:text-[#A8A29E] sm:text-sm dark:text-white"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} className="text-[#A8A29E] hover:text-[#1E1E24] dark:hover:text-white" aria-label="Borrar búsqueda">
              <X className="size-3.5" />
            </button>
          ) : null}
        </label>
        <button
          type="button"
          onClick={onNewChat}
          disabled={busy}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-[#1E1E24] text-white transition hover:bg-black focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-40 dark:bg-white dark:text-[#0B0A10] dark:hover:bg-white/90 dark:focus-visible:ring-offset-[#121019]"
          aria-label="Nueva conversación"
          title="Nueva conversación"
        >
          <MessageSquarePlus className="size-4" />
        </button>
        <button type="button" className={cn(iconButton, "hidden md:grid")} onClick={onCollapse} aria-label="Ocultar agentes" title="Ocultar agentes">
          <PanelLeftClose className="size-4" />
        </button>
        <button type="button" className={cn(iconButton, "md:hidden")} onClick={onClose} aria-label="Cerrar agentes">
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
        <section aria-labelledby="vega-pinned-title" className="px-3 pt-1">
          <h2 id="vega-pinned-title" className="sr-only">
            Agentes principales
          </h2>
          <ul className="grid grid-cols-3 gap-2">
            {pinned.map((agent) => {
              const active = agent.id === activeAgentId;
              return (
                <li key={agent.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelectAgent(agent)}
                    disabled={busy && !active}
                    aria-current={active ? "true" : undefined}
                    aria-label={`${agent.name}${agent.isDefault ? " (principal)" : ""}`}
                    className={cn(
                      "flex aspect-[1/1.08] w-full flex-col items-center justify-center gap-1.5 rounded-[22px] px-1.5 pt-2 pb-1.5 transition focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none",
                      active
                        ? "bg-white shadow-[0_1px_2px_rgba(16,12,32,0.05),0_14px_30px_-20px_rgba(76,29,149,0.55)] ring-1 ring-[#DDD6FE] dark:bg-white/[0.09] dark:ring-[#7C3AED]/45"
                        : "bg-white/60 hover:bg-white dark:bg-white/[0.04] dark:hover:bg-white/[0.08]",
                    )}
                  >
                    <AgentAvatar agent={agent} className="size-12" />
                    <span className="w-full truncate text-center text-xs font-medium text-[#1E1E24] dark:text-[#ECEAF3]">{agent.name}</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onEditAgent(agent)}
                    className="absolute top-1 right-1 grid size-7 place-items-center rounded-full bg-white/90 text-[#6B6760] opacity-0 shadow-sm transition group-focus-within:opacity-100 group-hover:opacity-100 hover:text-[#1E1E24] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none max-md:opacity-100 dark:bg-[#24212F] dark:text-[#C7C2D3]"
                    aria-label={`Editar ${agent.name}`}
                  >
                    <Pencil className="size-3" />
                  </button>
                </li>
              );
            })}
            {pinned.length < PINNED ? (
              <li>
                <button
                  type="button"
                  onClick={onCreateAgent}
                  disabled={busy}
                  className="flex aspect-[1/1.08] w-full flex-col items-center justify-center gap-1.5 rounded-[22px] border border-dashed border-[#D9D4CC] text-[#8A8680] transition hover:border-[#A78BFA] hover:text-[#7C3AED] focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none dark:border-white/15"
                >
                  <Plus className="size-5" />
                  <span className="text-xs font-medium">Crear</span>
                </button>
              </li>
            ) : null}
          </ul>
        </section>

        <section aria-labelledby="vega-more-title" className="mt-3 px-2">
          <div className="flex items-center justify-between px-2 pb-1">
            <h2 id="vega-more-title" className="text-xs font-medium text-[#8A8680]">
              {agents.length > PINNED ? "Más agentes" : "Agentes"}
            </h2>
            <button
              type="button"
              onClick={onCreateAgent}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-[#7C3AED] hover:bg-[#7C3AED]/10 focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none disabled:opacity-50 dark:text-[#C4B5FD]"
            >
              <Plus className="size-3.5" /> Crear agente
            </button>
          </div>
          <ul className="space-y-0.5">
            {others.map((agent) => {
              const active = agent.id === activeAgentId;
              return (
                <li key={agent.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelectAgent(agent)}
                    disabled={busy && !active}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl px-2 py-2 pr-10 text-left transition focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none",
                      active ? "bg-white shadow-sm dark:bg-white/[0.08]" : "hover:bg-white/70 dark:hover:bg-white/[0.05]",
                    )}
                  >
                    <AgentAvatar agent={agent} className="size-10" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[#1E1E24] dark:text-white">{agent.name}</span>
                      <span className="block truncate text-xs text-[#8A8680]">{agent.preview || agent.specialty || "Sin mensajes todavía"}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onEditAgent(agent)}
                    className={cn(iconButton, "absolute top-1/2 right-1 size-8 -translate-y-1/2 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100")}
                    aria-label={`Editar ${agent.name}`}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                </li>
              );
            })}
            {others.length === 0 && agents.length > PINNED && query ? <li className="px-3 py-2 text-xs text-[#8A8680]">Ningún agente coincide.</li> : null}
          </ul>
        </section>

        <nav className="mt-3 px-2" aria-label={`Conversaciones con ${activeAgent?.name ?? "Vega"}`}>
          <p className="px-2 pb-1 text-xs font-medium text-[#8A8680]">Conversaciones con {activeAgent?.name ?? "Vega"}</p>
          <ul className="space-y-0.5">
            {visibleChats.length === 0 ? (
              <li className="px-2 py-2 text-xs leading-5 text-[#8A8680]">
                {query ? "Ninguna conversación coincide." : `Todavía no hay conversaciones con ${activeAgent?.name ?? "este agente"}.`}
              </li>
            ) : null}
            {visibleChats.map((chat) => (
              <li key={chat.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelectChat(chat.id)}
                  aria-current={chat.id === activeChatId ? "page" : undefined}
                  className={cn(
                    "w-full truncate rounded-xl px-3 py-2.5 pr-16 text-left text-[15px] transition focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none md:py-2 md:text-sm",
                    chat.id === activeChatId
                      ? "bg-white font-medium text-[#1E1E24] shadow-sm dark:bg-white/[0.08] dark:text-white"
                      : "text-[#4B4757] hover:bg-white/70 dark:text-[#B9B4C6] dark:hover:bg-white/[0.05]",
                  )}
                >
                  {chat.title}
                </button>
                <span className="absolute top-1/2 right-1 flex -translate-y-1/2 gap-0.5 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                  <button type="button" onClick={() => onRenameChat(chat)} className={cn(iconButton, "size-8")} aria-label={`Renombrar «${chat.title}»`}>
                    <Pencil className="size-3.5" />
                  </button>
                  <button type="button" onClick={() => onDeleteChat(chat.id)} className={cn(iconButton, "size-8 hover:text-[#B42318]")} aria-label={`Borrar «${chat.title}»`}>
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="px-3 pt-1 pb-3">
        <button
          type="button"
          onClick={onOpenLyraMenu}
          className="flex w-full items-center gap-2.5 rounded-2xl px-2 py-2 text-left transition hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none dark:hover:bg-white/[0.05]"
          aria-label="Abrir el menú de LYRA"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#7C3AED,#06B6D4)] text-xs font-semibold text-white">{initials}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-[#1E1E24] dark:text-white">{userName}</span>
            <span className="block truncate text-xs text-[#8A8680]">Menú de LYRA · red, billetera y más</span>
          </span>
          <LayoutGrid className="size-4 shrink-0 text-[#8A8680]" aria-hidden />
        </button>
      </div>
    </aside>
  );
}
