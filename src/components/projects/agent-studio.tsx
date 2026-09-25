"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { askProjectAgent } from "@/app/dashboard/projects/actions";
import { brand } from "@/config/brand";
import type { AgentDocument } from "@/lib/agent-document";

type Turn = { role: "user" | "agent"; text: string };

export function AgentStudio({ projectId, agent }: { projectId: string; agent: AgentDocument }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [turns, setTurns] = useState<Turn[]>([{ role: "agent", text: agent.greeting }]);
  const [pending, startTransition] = useTransition();

  function send(text: string) {
    const message = text.trim();
    if (message.length < 2 || pending) return;
    setDraft("");
    setError("");
    setTurns((current) => [...current, { role: "user", text: message }]);
    startTransition(async () => {
      const result = await askProjectAgent(projectId, message);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTurns((current) => [...current, { role: "agent", text: result.output }]);
    });
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[#8A8680]">Agente</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1E1E24] sm:text-4xl">{agent.name}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5C5854]">{agent.instruction}</p>
        </div>
        <Link href={brand.links.dashboard} className="text-sm text-[#7C3AED]">
          Volver
        </Link>
      </div>
      <section className="rounded-3xl border border-[#E7E2DA] bg-white">
        <div className="space-y-3 px-5 py-5">
          {turns.map((turn, index) => (
            <p
              key={`${turn.role}-${index}`}
              className={
                turn.role === "user"
                  ? "ml-auto max-w-[85%] rounded-2xl bg-[#EDE9FE] px-4 py-3 text-sm leading-6 text-[#1E1E24]"
                  : "max-w-[85%] rounded-2xl bg-[#F4F1EC] px-4 py-3 text-sm leading-6 text-[#1E1E24]"
              }
            >
              {turn.text}
            </p>
          ))}
          {pending ? <p className="text-sm text-[#7C3AED]">Está escribiendo…</p> : null}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-[#E7E2DA] px-5 py-3">
          {agent.prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => send(prompt)}
              className="rounded-full border border-[#E7E2DA] px-3 py-1.5 text-sm text-[#1E1E24]"
            >
              {prompt}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2 border-t border-[#E7E2DA] p-4"
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
          }}
        >
          <label htmlFor="agent-message" className="sr-only">
            Mensaje para {agent.name}
          </label>
          <input
            id="agent-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Escríbele al agente"
            className="h-11 flex-1 rounded-lg border border-[#E7E2DA] px-3 text-sm text-[#1E1E24] outline-none focus:border-[#7C3AED]"
          />
          <button
            type="submit"
            disabled={pending || draft.trim().length < 2}
            className="rounded-lg bg-[#7C3AED] px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            Enviar
          </button>
        </form>
        {error ? <p className="px-5 pb-4 text-sm text-[#9A3B2F]">{error}</p> : null}
      </section>
    </div>
  );
}
