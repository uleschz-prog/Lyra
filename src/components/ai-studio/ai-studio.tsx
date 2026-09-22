"use client";

import { Compass, PenLine, Send, Target, Zap, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useCredits } from "@/components/dashboard/credit-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { simulateAgentReply } from "@/lib/agent-reply";
import { formatCredits } from "@/lib/format";
import type { DemoAgent } from "@/lib/types";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const agentIcons: Record<string, LucideIcon> = {
  prospector: Target,
  copywriter: PenLine,
  closer: Zap,
  mentor: Compass,
};

export function AiStudio({
  agents,
  initialAgentId,
}: {
  agents: DemoAgent[];
  initialAgentId?: string;
}) {
  const known = agents.some((agent) => agent.id === initialAgentId) ? initialAgentId : null;
  const [selectedId, setSelectedId] = useState<string | null>(known ?? null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({});
  const { balance, spend } = useCredits();
  const selected = agents.find((agent) => agent.id === selectedId) ?? null;
  const messages = selected ? (threads[selected.id] ?? []) : [];
  const canAfford = selected ? balance >= selected.creditCost : false;

  function selectAgent(id: string) {
    setSelectedId(id);
    setDraft("");
    setPending(false);
  }

  function send() {
    if (!selected || pending) return;
    const note = draft.trim();
    if (!note) return;

    const charged = spend({
      agentName: selected.name,
      creditCost: selected.creditCost,
      note,
    });

    if (!charged) {
      toast.error("Créditos insuficientes", {
        description: `${selected.name} requiere ${selected.creditCost} créditos.`,
      });
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: note,
    };

    setThreads((current) => ({
      ...current,
      [selected.id]: [...(current[selected.id] ?? []), userMessage],
    }));
    setDraft("");
    setPending(true);
    toast.success("Créditos descontados", {
      description: `${selected.creditCost} créditos · ${selected.name}`,
    });

    const reply = simulateAgentReply(selected, note);
    window.setTimeout(() => {
      setThreads((current) => ({
        ...current,
        [selected.id]: [
          ...(current[selected.id] ?? []),
          { id: crypto.randomUUID(), role: "assistant", content: reply },
        ],
      }));
      setPending(false);
    }, 700);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className={cn("space-y-3", selected && "hidden lg:block")}>
        {agents.map((agent) => {
          const Icon = agentIcons[agent.id] ?? Target;
          const active = agent.id === selectedId;

          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => selectAgent(agent.id)}
              className={cn(
                "w-full rounded-2xl border bg-lyra-card p-4 text-left shadow-[0_0_15px_rgba(124,58,237,0.12)]",
                active ? "border-lyra-cyan/50" : "border-lyra-border hover:border-white/15",
              )}
            >
              <span className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-lyra-border text-lyra-cyan">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm text-white">{agent.name}</span>
                  <span className="mt-1 block text-xs leading-5 text-zinc-500">{agent.description}</span>
                </span>
              </span>
              <span className="mt-3 flex items-center justify-between">
                <Badge variant="cyan">{agent.category}</Badge>
                <span className="font-mono text-xs text-zinc-300">{agent.creditCost} créditos</span>
              </span>
            </button>
          );
        })}
      </div>

      <section
        className={cn(
          "flex min-h-[540px] flex-col rounded-2xl border border-lyra-border bg-lyra-card shadow-[0_0_15px_rgba(124,58,237,0.15)]",
          !selected && "hidden lg:flex",
        )}
      >
        {selected ? (
          <>
            <header className="border-b border-lyra-border px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <button
                    type="button"
                    className="mb-2 text-xs text-zinc-500 lg:hidden"
                    onClick={() => setSelectedId(null)}
                  >
                    Volver a los agentes
                  </button>
                  <h2 className="text-lg tracking-wide text-white">{selected.name}</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    Simulación · {selected.creditCost} créditos por consulta · saldo {formatCredits(balance)}
                  </p>
                </div>
                <Badge>{selected.uses} usos</Badge>
              </div>
              <p className="mt-4 rounded-xl border border-lyra-border bg-black/20 px-3 py-3 text-xs leading-5 text-zinc-400">
                {selected.promptTemplate}
              </p>
            </header>

            <div aria-live="polite" className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
              {messages.length === 0 ? (
                <p className="text-sm leading-6 text-zinc-500">
                  Escribe el contexto del contacto, la pieza o la lección. La respuesta se genera en el navegador y descuenta créditos de tu billetera.
                </p>
              ) : (
                messages.map((message) => (
                  <p
                    key={message.id}
                    className={cn(
                      "max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6",
                      message.role === "user"
                        ? "ml-auto bg-lyra-violet/20 text-zinc-100"
                        : "border border-lyra-border bg-black/25 text-zinc-200",
                    )}
                  >
                    {message.content}
                  </p>
                ))
              )}
              {pending ? <p className="text-xs tracking-[0.16em] text-lyra-cyan">CONSULTANDO</p> : null}
            </div>

            <form
              className="border-t border-lyra-border p-4"
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
                placeholder="Describe el contacto, el texto o la lección"
                className="w-full resize-none rounded-xl border border-lyra-border bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-lyra-violet/50"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    send();
                  }
                }}
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-500">
                  {canAfford
                    ? `Esta consulta usa ${selected.creditCost} créditos.`
                    : "No alcanzan los créditos para este agente."}
                </p>
                <Button type="submit" disabled={pending || !draft.trim() || !canAfford}>
                  <Send className="h-4 w-4" aria-hidden />
                  Consultar
                </Button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex flex-1 flex-col justify-center px-8">
            <p className="text-[11px] uppercase tracking-[0.28em] text-lyra-cyan">Estudio</p>
            <h2 className="mt-3 text-2xl tracking-[0.08em] text-white">Elige un agente</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-zinc-400">
              Cada consulta descuenta el costo del agente y queda registrada en la billetera.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
