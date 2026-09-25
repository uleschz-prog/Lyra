"use client";

import {
  Aperture,
  Briefcase,
  CalendarDays,
  Globe,
  Mail,
  MessageCircle,
  MessagesSquare,
  Send,
  Share2,
  Smartphone,
  Sparkles,
  Star,
  type LucideIcon,
} from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { agentIcons } from "@/components/ai-studio/agent-icons";
import { useCredits } from "@/components/dashboard/credit-provider";
import { channels, masterPrompt } from "@/config/constellation";
import { simulateAgentReply } from "@/lib/agent-reply";
import { formatCredits } from "@/lib/format";
import type { ChannelId, DemoAgent } from "@/lib/types";
import { cn } from "@/lib/utils";

const channelIcons: Record<ChannelId, LucideIcon> = {
  whatsapp: MessageCircle,
  email: Mail,
  telegram: Send,
  instagram: Aperture,
  facebook: Share2,
  linkedin: Briefcase,
  messenger: MessagesSquare,
  sms: Smartphone,
  web: Globe,
  calendar: CalendarDays,
};

const storageKey = "lyra-channels";
const storageEvent = "lyra-channels-change";

function readLinks() {
  if (typeof window === "undefined") return "{}";
  return window.localStorage.getItem(storageKey) ?? "{}";
}

function subscribeLinks(onStoreChange: () => void) {
  window.addEventListener(storageEvent, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(storageEvent, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function parseLinks(raw: string): Partial<Record<ChannelId, string>> {
  try {
    const value = JSON.parse(raw) as Partial<Record<ChannelId, string>>;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export function AiStudio({
  agents,
  initialAgentId,
}: {
  agents: DemoAgent[];
  initialAgentId?: string;
}) {
  const known = agents.some((agent) => agent.id === initialAgentId) ? initialAgentId : null;
  const [selectedId, setSelectedId] = useState<string | null>(known ?? agents[0]?.id ?? null);
  const [channelId, setChannelId] = useState<ChannelId>("whatsapp");
  const [draft, setDraft] = useState("");
  const [handleDraft, setHandleDraft] = useState("");
  const [promptOpen, setPromptOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({});
  const rawLinks = useSyncExternalStore(subscribeLinks, readLinks, () => "{}");
  const links = parseLinks(rawLinks);
  const { balance, spend } = useCredits();
  const selected = agents.find((agent) => agent.id === selectedId) ?? null;
  const activeChannel = selected?.channels.includes(channelId) ? channelId : (selected?.channels[0] ?? "whatsapp");
  const channel = channels.find((item) => item.id === activeChannel) ?? channels[0];
  const linkedHandle = links[activeChannel];
  const messages = selected ? (threads[selected.id] ?? []) : [];
  const canAfford = selected ? balance >= selected.creditCost : false;

  function selectAgent(id: string) {
    const next = agents.find((agent) => agent.id === id);
    setSelectedId(id);
    if (next && !next.channels.includes(activeChannel)) {
      setChannelId(next.channels[0]);
    }
    setDraft("");
    setPending(false);
  }

  function saveLink() {
    const handle = handleDraft.trim();
    if (!handle) return;
    const next = { ...links, [activeChannel]: handle };
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    window.dispatchEvent(new Event(storageEvent));
    setHandleDraft("");
    toast.success(`${channel.label} vinculado`, { description: handle });
  }

  function appendMessage(agentId: string, message: ChatMessage) {
    setThreads((current) => ({
      ...current,
      [agentId]: [...(current[agentId] ?? []), message],
    }));
  }

  async function send() {
    if (!selected || pending) return;
    const note = draft.trim();
    if (!note) return;

    if (balance < selected.creditCost) {
      toast.error("Créditos insuficientes", {
        description: `${selected.name} requiere ${selected.creditCost} créditos.`,
      });
      return;
    }

    const agent = selected;
    const channelName = activeChannel;
    const destination = linkedHandle;
    appendMessage(agent.id, { id: crypto.randomUUID(), role: "user", content: note });
    setDraft("");
    setPending(true);

    const reply = simulateAgentReply(agent, note, channelName, destination);
    let content = reply;

    if (channelName === "whatsapp") {
      if (!destination) {
        content = `${reply}\n\nVincula el número de WhatsApp para enviarlo.`;
      } else {
        const response = await fetch("/api/ai/whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: destination, text: reply }),
        });
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          sent?: boolean;
          connectUrl?: string | null;
        } | null;
        if (payload?.sent) {
          const charged = spend({
            agentName: agent.name,
            creditCost: agent.creditCost,
            note,
          });
          content = charged
            ? `${reply}\n\nEnviado por WhatsApp a ${destination}.`
            : `${reply}\n\nWhatsApp lo envió, pero no alcanzó el saldo para descontar créditos.`;
          toast.success("Mensaje enviado por WhatsApp", { description: destination });
        } else {
          content = payload?.connectUrl
            ? `${reply}\n\nConecta WhatsApp al proyecto Lira y vuelve a ejecutar:\n${payload.connectUrl}`
            : `${reply}\n\n${payload?.error ?? "WhatsApp no aceptó el envío."}`;
          toast.error("WhatsApp no envió el mensaje", {
            description: payload?.connectUrl ? "Abre el enlace del panel para conectar el proyecto Lira." : (payload?.error ?? "Revisa la conexión de Composio."),
          });
        }
      }
    } else {
      const charged = spend({
        agentName: agent.name,
        creditCost: agent.creditCost,
        note,
      });
      if (!charged) {
        setPending(false);
        toast.error("Créditos insuficientes", {
          description: `${agent.name} requiere ${agent.creditCost} créditos.`,
        });
        return;
      }
      toast.success("Borrador listo", { description: `${agent.creditCost} créditos · ${agent.star}` });
    }

    appendMessage(agent.id, { id: crypto.randomUUID(), role: "assistant", content });
    setPending(false);
  }

  const ctaClass =
    "inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#312F2F] px-4 text-sm font-medium text-white transition-colors hover:bg-[#1E1E24] disabled:pointer-events-none disabled:opacity-40 sm:w-auto";

  return (
    <div className="space-y-5">
      <p className="inline-flex max-w-full items-center rounded-full border border-border bg-[#F4F1EC] px-3 py-1 text-xs text-[#5C5854]">
        Estudio de agentes
      </p>

      <section className="rounded-2xl border border-border bg-surface/80 p-5 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-[10px] tracking-[0.16em] text-[#8A8680] uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
              Prompt nodo raíz activo
            </p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-[#1E1E24] sm:text-2xl">Prompt maestro · Vega</h1>
            <p className="mt-1 text-sm leading-relaxed text-[#5C5854]">La ley que heredan todas las estrellas del estudio.</p>
          </div>
          <button
            type="button"
            onClick={() => setPromptOpen((open) => !open)}
            className="rounded-lg border border-[#D9D5CE] bg-transparent px-4 py-2 text-xs font-medium text-[#1E1E24] transition-colors hover:bg-[#F4F1EC]"
          >
            {promptOpen ? "Ocultar" : "Leer prompt"}
          </button>
        </div>
        {promptOpen ? (
          <pre className="relative mt-4 whitespace-pre-wrap rounded-xl border border-border bg-white p-4 font-sans text-sm leading-6 text-[#5C5854]">
            {masterPrompt}
          </pre>
        ) : (
          <p className="relative mt-4 line-clamp-2 text-sm leading-6 text-[#5C5854]">{masterPrompt}</p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className={cn("space-y-2", selected && "hidden lg:block")}>
          {agents.map((agent) => {
            const Icon = agentIcons[agent.id] ?? Star;
            const active = agent.id === selectedId;
            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => selectAgent(agent.id)}
                className={cn(
                  "relative w-full overflow-hidden rounded-xl border bg-surface/80 p-4 text-left backdrop-blur-md transition-colors",
                  active
                    ? "border-accent-purple"
                    : "border-border hover:border-[#C9C3BA]",
                )}
              >
                <span className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-[#F4F1EC] text-accent-purple">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="inline-flex items-center gap-2 font-semibold tracking-tight text-[#1E1E24]">
                      {active ? <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" /> : null}
                      {agent.name}
                    </span>
                    <span className="mt-0.5 block text-[10px] tracking-[0.16em] text-[#7C3AED] uppercase">
                      {agent.star}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-[#5C5854]">{agent.description}</span>
                  </span>
                </span>
                <span className="mt-3 flex items-center justify-between pl-1">
                  <span className="rounded-full border border-border bg-[#F4F1EC] px-2.5 py-0.5 text-[10px] tracking-[0.12em] text-[#5C5854] uppercase">
                    {agent.category}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-[#7C3AED]">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    {agent.creditCost}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <section
          className={cn(
            "relative flex min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-border bg-surface/80 backdrop-blur-md sm:min-h-[36rem] lg:min-h-[680px]",
            !selected && "hidden lg:flex",
          )}
        >
          {selected ? (
            <>
              <header className="relative border-b border-border px-5 py-5">
                <button
                  type="button"
                  className="mb-3 min-h-11 text-xs text-[#5C5854] lg:hidden"
                  onClick={() => setSelectedId(null)}
                >
                  Ver la constelación
                </button>
                <p className="text-[10px] tracking-[0.18em] text-[#8A8680] uppercase">
                  Consola de ejecución
                </p>
                <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#1E1E24] sm:text-3xl">{selected.name}</h2>
                    <p className="mt-2 text-xs text-[#06B6D4]">
                      {selected.star} · saldo {formatCredits(balance)} · {formatCredits(selected.uses)} usos
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <span className="rounded-full border border-border bg-[#F4F1EC] px-2.5 py-0.5 text-[10px] tracking-[0.14em] text-[#5C5854] uppercase">
                      {selected.category}
                    </span>
                    <span className="inline-flex items-center gap-2 text-xs text-[#5C5854]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                      Listo
                    </span>
                  </div>
                </div>
                <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
                  {selected.channels.map((id) => {
                    const item = channels.find((channelItem) => channelItem.id === id);
                    if (!item) return null;
                    const Icon = channelIcons[id];
                    const on = id === activeChannel;
                    const linked = Boolean(links[id]);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setChannelId(id)}
                        className={cn(
                          "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors",
                          on
                            ? "border-[#7C3AED]/30 bg-[#7C3AED]/10 text-[#1E1E24]"
                            : "border-border bg-transparent text-[#5C5854] hover:border-[#C9C3BA] hover:text-[#1E1E24]",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                        {item.label}
                        <span className={cn("h-1.5 w-1.5 rounded-full", linked ? "bg-[#7C3AED]" : "bg-[#D9D5CE]")} />
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={handleDraft}
                    onChange={(event) => setHandleDraft(event.target.value)}
                    placeholder={linkedHandle ? `Vinculado: ${linkedHandle}` : channel.placeholder}
                    aria-label={`Destino de ${channel.label}`}
                    className="h-11 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-[#1E1E24] outline-none placeholder:text-[#8A8680] focus:border-[#7C3AED]/60"
                  />
                  <button type="button" onClick={saveLink} disabled={!handleDraft.trim()} className={ctaClass}>
                    Vincular {channel.label}
                  </button>
                </div>
              </header>

              <div aria-live="polite" className="relative flex-1 space-y-3 overflow-y-auto px-5 py-5">
                {messages.length === 0 ? (
                  <p className="text-sm leading-relaxed text-[#5C5854]">
                    {selected.promptTemplate}{" "}
                    {activeChannel === "whatsapp"
                      ? linkedHandle
                        ? `WhatsApp sale por Composio hacia ${linkedHandle}.`
                        : "Vincula el número de WhatsApp para enviarlo por Composio."
                      : `El borrador sale con el formato de ${channel.label}${linkedHandle ? ` y queda dirigido a ${linkedHandle}.` : ". Vincula el destino para marcarlo como listo para enviar."}`}
                  </p>
                ) : (
                  messages.map((message) => (
                    <p
                      key={message.id}
                      className={cn(
                        "max-w-[92%] rounded-lg border px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                        message.role === "user"
                          ? "ml-auto border-border bg-[#F4F1EC] text-[#1E1E24]"
                          : "border-border bg-background text-[#1E1E24]",
                      )}
                    >
                      {message.content}
                    </p>
                  ))
                )}
                {pending ? <p className="text-xs tracking-[0.16em] text-[#7C3AED]">VEGA ESTÁ ESCRIBIENDO</p> : null}
              </div>

              <form
                className="relative border-t border-border p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  send();
                }}
              >
                <label htmlFor="consulta" className="sr-only">
                  Consulta para el agente
                </label>
                <textarea
                  id="consulta"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={3}
                  placeholder={`Contexto para ${selected.name} por ${channel.label}`}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-3 text-sm text-[#1E1E24] outline-none placeholder:text-[#8A8680] focus:border-[#7C3AED]/60"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      send();
                    }
                  }}
                />
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-[#5C5854]">
                    {canAfford ? (
                      <span className="text-[#7C3AED]">{selected.creditCost} créditos por ejecución</span>
                    ) : (
                      "No alcanzan los créditos para este agente."
                    )}
                  </p>
                  <button type="submit" disabled={pending || !draft.trim() || !canAfford} className={ctaClass}>
                    <Send className="h-4 w-4" aria-hidden />
                    Ejecutar agente
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="relative flex flex-1 flex-col justify-center px-8">
              <p className="text-[11px] tracking-[0.18em] text-[#06B6D4] uppercase">Consola</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[#1E1E24]">Elige un agente</h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-[#5C5854]">
                Cada agente hereda el prompt maestro y despacha por los canales que tiene vinculados.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
