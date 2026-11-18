"use client";

import { ChevronLeft, MessageSquarePlus, PanelLeftClose, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";

import type { VegaAgentSummary, VegaChatSummary } from "@/app/dashboard/super-agent/actions";
import { AgentAvatar } from "@/components/vega/agent-avatar";
import { cn } from "@/lib/utils";

const iconButton =
  "grid size-8 place-items-center rounded-lg text-[#8A8680] transition hover:bg-[#F3F0EB] hover:text-[#1E1E24] focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none disabled:opacity-40 dark:hover:bg-white/10 dark:hover:text-white";

/** Columna izquierda de Vega v2: tus agentes y las conversaciones del agente activo. */
export function AgentSidebar({
  open,
  hidden,
  busy,
  agents,
  activeAgentId,
  chats,
  activeChatId,
  onClose,
  onCollapse,
  onNewChat,
  onSelectAgent,
  onCreateAgent,
  onEditAgent,
  onDeleteAgent,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
}: {
  open: boolean;
  hidden: boolean;
  busy: boolean;
  agents: VegaAgentSummary[];
  activeAgentId: string;
  chats: VegaChatSummary[];
  activeChatId: string | null;
  onClose: () => void;
  onCollapse: () => void;
  onNewChat: () => void;
  onSelectAgent: (agent: VegaAgentSummary) => void;
  onCreateAgent: () => void;
  onEditAgent: (agent: VegaAgentSummary) => void;
  onDeleteAgent: (agent: VegaAgentSummary) => void;
  onSelectChat: (id: string) => void;
  onRenameChat: (chat: VegaChatSummary) => void;
  onDeleteChat: (id: string) => void;
}) {
  const activeAgent = agents.find((agent) => agent.id === activeAgentId);
  return (
    <aside
      id="vega-agents"
      aria-label="Agentes y conversaciones"
      className={cn(
        "fixed top-0 bottom-[var(--lyra-tab)] left-0 z-50 flex w-[min(86vw,320px)] flex-col border-r border-[#EEE9E2] bg-[#FBFAF8] pt-[env(safe-area-inset-top)] transition-transform duration-200 md:static md:z-auto md:w-72 md:translate-x-0 md:pt-0 dark:border-white/8 dark:bg-[#0F0D16]",
        open ? "translate-x-0 shadow-2xl md:shadow-none" : "-translate-x-full",
        hidden && "md:hidden",
      )}
    >
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
          <span className="bg-[linear-gradient(135deg,#7C3AED,#06B6D4,#10B981)] bg-clip-text text-base font-semibold tracking-tight text-transparent">Vega</span>
          <span className="rounded-full border border-[#E7E2DA] px-1.5 py-0.5 text-[10px] font-medium text-[#8A8680] dark:border-white/10">v2</span>
        </div>
        <button type="button" className={cn(iconButton, "hidden md:grid")} onClick={onCollapse} aria-label="Ocultar agentes" title="Ocultar agentes">
          <PanelLeftClose className="size-4" />
        </button>
        <button type="button" className={cn(iconButton, "md:hidden")} onClick={onClose} aria-label="Cerrar agentes">
          <X className="size-4" />
        </button>
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onNewChat}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#7C3AED,#6D28D9_55%,#0891B2)] px-3 py-2.5 text-sm font-medium text-white shadow-[0_12px_28px_-14px_rgba(124,58,237,0.9)] transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[#06B6D4] focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50 dark:focus-visible:ring-offset-[#0F0D16]"
        >
          <MessageSquarePlus className="size-4" />
          Nueva conversación
        </button>
      </div>

      <section className="shrink-0 border-b border-[#EEE9E2] px-3 pb-3 dark:border-white/8" aria-labelledby="vega-agents-title">
        <div className="mb-1.5 flex items-center justify-between px-1">
          <h2 id="vega-agents-title" className="text-[11px] font-semibold tracking-[0.14em] text-[#8A8680] uppercase">
            Agentes
          </h2>
          <button
            type="button"
            onClick={onCreateAgent}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-[#7C3AED] hover:bg-[#F5F3FF] focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none disabled:opacity-50 dark:text-[#C4B5FD] dark:hover:bg-white/10"
          >
            <Plus className="size-3.5" /> Crear
          </button>
        </div>
        <ul className="max-h-[min(38dvh,300px)] space-y-0.5 overflow-y-auto">
          {agents.map((agent) => {
            const active = agent.id === activeAgentId;
            return (
              <li key={agent.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelectAgent(agent)}
                  disabled={busy && !active}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-2 py-2 pr-16 text-left transition focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none",
                    active
                      ? "bg-white text-[#1E1E24] shadow-[0_1px_0_rgba(0,0,0,0.04),0_8px_20px_-14px_rgba(124,58,237,0.6)] ring-1 ring-[#DDD6FE] dark:bg-[#1C1828] dark:text-white dark:ring-[#7C3AED]/40"
                      : "text-[#5C5854] hover:bg-[#F3F0EB] dark:text-[#C7C2D3] dark:hover:bg-white/6",
                  )}
                >
                  <AgentAvatar agent={agent} ring={active} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {agent.name}
                      {agent.isDefault ? <span className="rounded-full bg-[#ECFEFF] px-1.5 text-[10px] font-medium text-[#0E7490] dark:bg-[#06B6D4]/15 dark:text-[#67E8F9]">Principal</span> : null}
                    </span>
                    <span className="block truncate text-[11px] text-[#8A8680]">{agent.specialty || "Sin especialidad"}</span>
                  </span>
                </button>
                <span className="absolute top-1/2 right-1.5 flex -translate-y-1/2 gap-0.5 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                  <button type="button" disabled={busy} onClick={() => onEditAgent(agent)} className={iconButton} aria-label={`Editar ${agent.name}`}>
                    <Pencil className="size-3.5" />
                  </button>
                  {!agent.isDefault ? (
                    <button type="button" disabled={busy} onClick={() => onDeleteAgent(agent)} className={cn(iconButton, "hover:text-[#B42318]")} aria-label={`Eliminar ${agent.name}`}>
                      <Trash2 className="size-3.5" />
                    </button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <nav className="flex min-h-0 flex-1 flex-col" aria-label={`Conversaciones con ${activeAgent?.name ?? "Vega"}`}>
        <p className="px-4 pt-3 pb-1.5 text-[11px] font-semibold tracking-[0.14em] text-[#8A8680] uppercase">Conversaciones</p>
        <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {chats.length === 0 ? (
            <li className="px-3 py-4 text-xs leading-5 text-[#8A8680]">Todavía no hay conversaciones con {activeAgent?.name ?? "este agente"}.</li>
          ) : null}
          {chats.map((chat) => (
            <li key={chat.id} className="group relative">
              <button
                type="button"
                onClick={() => onSelectChat(chat.id)}
                aria-current={chat.id === activeChatId ? "page" : undefined}
                className={cn(
                  "w-full truncate rounded-lg px-3 py-2.5 pr-16 text-left text-[15px] transition focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none md:py-2 md:text-sm",
                  chat.id === activeChatId
                    ? "bg-[#EDE9FE] text-[#1E1E24] dark:bg-[#7C3AED]/20 dark:text-white"
                    : "text-[#5C5854] hover:bg-[#F3F0EB] dark:text-[#A9A3B8] dark:hover:bg-white/6",
                )}
              >
                {chat.title}
              </button>
              <span className="absolute top-1/2 right-1 flex -translate-y-1/2 gap-0.5 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                <button type="button" onClick={() => onRenameChat(chat)} className={iconButton} aria-label={`Renombrar «${chat.title}»`}>
                  <Pencil className="size-3.5" />
                </button>
                <button type="button" onClick={() => onDeleteChat(chat.id)} className={cn(iconButton, "hover:text-[#B42318]")} aria-label={`Borrar «${chat.title}»`}>
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      </nav>
      <Link
        href="/dashboard"
        className="mx-3 mb-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-[#5C5854] hover:bg-[#F3F0EB] md:hidden dark:text-[#A9A3B8] dark:hover:bg-white/6"
      >
        <ChevronLeft className="size-4" />
        Volver a LYRA
      </Link>
    </aside>
  );
}
