"use client";

import { ArrowUp, ChevronDown, Mic, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { ExamplePreviews } from "@/components/landing/example-previews";
import { cn } from "@/lib/utils";

const ideas = [
  {
    id: "apps",
    label: "Apps",
    prompts: [
      "Una app de reservas para mi clínica",
      "Una app para cobrar membresías de mi gimnasio",
      "Un panel donde mi equipo vea las citas del día",
    ],
  },
  {
    id: "sitios",
    label: "Sitios web",
    prompts: [
      "Un sitio web para mi estudio",
      "Una landing para lanzar mi curso",
      "Una página de menú para mi restaurante",
    ],
  },
  {
    id: "agentes",
    label: "Agentes",
    prompts: [
      "Un superagente de recepción que agende citas en WhatsApp",
      "Un agente que responda dudas de mis clientes por la noche",
      "Un agente que confirme citas y mande recordatorios",
    ],
  },
  {
    id: "herramientas",
    label: "Herramientas",
    prompts: [
      "Una herramienta interna para seguir a mi equipo",
      "Un tablero de créditos y comisiones",
      "Una lista de tareas compartida con mi red",
    ],
  },
] as const;

type IdeaId = (typeof ideas)[number]["id"];

export function BuilderConsole() {
  const router = useRouter();
  const [idea, setIdea] = useState<IdeaId>("apps");
  const [promptIndex, setPromptIndex] = useState(0);
  const [count, setCount] = useState(0);
  const [draft, setDraft] = useState("");
  const active = ideas.find((item) => item.id === idea) ?? ideas[0];
  const suggestion = active.prompts[promptIndex] ?? active.prompts[0];
  const cycling = draft.length === 0;

  useEffect(() => {
    if (!cycling) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const timer = window.setTimeout(() => {
        setPromptIndex((value) => (value + 1) % active.prompts.length);
      }, 2800);
      return () => window.clearTimeout(timer);
    }

    if (count < suggestion.length) {
      const timer = window.setTimeout(() => setCount((value) => value + 1), 32);
      return () => window.clearTimeout(timer);
    }

    const pause = window.setTimeout(() => {
      setPromptIndex((value) => (value + 1) % active.prompts.length);
      setCount(0);
    }, 1700);
    return () => window.clearTimeout(pause);
  }, [active.prompts.length, count, cycling, suggestion]);

  function selectIdea(id: IdeaId) {
    setIdea(id);
    setPromptIndex(0);
    setCount(0);
    setDraft("");
  }

  function generate(event: FormEvent) {
    event.preventDefault();
    const text = (draft.trim() || suggestion).slice(0, 240);
    const kind = idea === "sitios" ? "site" : idea === "agentes" ? "agent" : "app";
    const params = new URLSearchParams({ idea: text, tipo: kind });
    router.push(`/register?${params.toString()}`);
  }

  const shown = cycling ? (count === 0 && suggestion ? "" : suggestion.slice(0, count)) : "";

  return (
    <div className="mx-auto mt-10 w-full max-w-[740px]">
      <form onSubmit={generate} className="rounded-[8px] bg-white px-4 pt-4 pb-3 shadow-[0_8px_30px_rgba(30,30,36,0.06)]">
        <label htmlFor="builder-prompt" className="sr-only">
          Describe lo que quieres construir
        </label>
        <div className="relative">
          <textarea
            id="builder-prompt"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            className="w-full resize-none bg-transparent text-lg text-[#0F0F0F] outline-none"
          />
          {cycling ? (
            <p aria-hidden className="pointer-events-none absolute inset-0 text-lg text-[#8A8680]">
              {shown}
              <span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-[#7C3AED] align-middle" />
            </p>
          ) : null}
        </div>
        <p className="sr-only" aria-live="polite">
          {cycling ? suggestion : ""}
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <button type="button" aria-label="Más opciones" className="grid h-9 w-9 place-items-center text-[#1E1E24]">
            <Plus className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <button type="submit" className="inline-flex items-center gap-1 px-2 text-base text-[#1E1E24]">
              Crear
              <ChevronDown className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" aria-label="Voz" className="grid h-9 w-9 place-items-center text-[#1E1E24]">
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="submit"
              aria-label="Enviar"
              className="grid h-9 w-9 place-items-center rounded-[6px] bg-[#7C3AED] text-white transition-colors hover:bg-[#6D28D9]"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </form>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-base text-[#252525]">
        {ideas.map((item, index) => (
          <span key={item.id} className="inline-flex items-center gap-3">
            {index > 0 ? <span aria-hidden className="text-[#D9D5CE]">·</span> : null}
            <button
              type="button"
              onClick={() => selectIdea(item.id)}
              className={cn(idea === item.id && "text-[#1E1E24]")}
            >
              {idea === item.id ? `[${item.label}]` : item.label}
            </button>
          </span>
        ))}
      </div>

      <ExamplePreviews
        category={idea}
        onPick={setDraft}
      />
    </div>
  );
}
