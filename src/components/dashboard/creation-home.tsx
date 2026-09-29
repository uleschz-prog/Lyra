"use client";

import { ArrowUp, ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";

import { createOfficeProject } from "@/app/dashboard/actions";
import { brand } from "@/config/brand";
import { projectKind, projectKindLabel } from "@/lib/project-kind";

const kinds = [
  { id: "app", label: "App", placeholder: "Describe la aplicación que quieres crear..." },
  { id: "sitio", label: "Sitio", placeholder: "Describe el sitio que quieres crear..." },
  { id: "agente", label: "Agente", placeholder: "Describe el agente que quieres crear..." },
] as const;

const starters = [
  { title: "Reservas", idea: "Una app de reservas para mi clínica", kind: "app" },
  { title: "Sitio", idea: "Un sitio web para mi estudio", kind: "sitio" },
  { title: "Recepción", idea: "Un agente que confirme citas y mande recordatorios", kind: "agente" },
] as const;

export function CreationHome({
  name,
  projects,
}: {
  name: string;
  projects: { id: string; title: string; idea: string; kind?: string }[];
}) {
  const [kind, setKind] = useState<(typeof kinds)[number]["id"]>("app");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const selected = kinds.find((item) => item.id === kind) ?? kinds[0];

  function submit(event: FormEvent) {
    event.preventDefault();
    const idea = draft.trim();
    if (idea.length < 8) {
      setError("Describe la idea con un poco más de detalle.");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await createOfficeProject(idea, kind);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="mx-auto max-w-3xl pt-4 sm:pt-10">
      <div className="flex justify-center">
        <Link
          href={brand.links.plan}
          className="inline-flex max-w-full items-center gap-3 rounded-full bg-[#EDE9FE] py-1.5 pr-1.5 pl-4 text-sm text-[#5B21B6]"
        >
          <span className="truncate">Started $99, Pro $499 y Founder $1,000</span>
          <span className="shrink-0 rounded-full bg-[#7C3AED] px-3 py-1 text-xs font-medium text-white">Ver el plan</span>
        </Link>
      </div>

      <h1 className="mt-14 text-center text-4xl font-semibold tracking-tight text-[#1E1E24] sm:text-5xl">
        Hola {name}
        <span className="text-[#7C3AED]">.</span>
      </h1>
      <p className="mt-2 text-center text-4xl font-semibold tracking-tight text-[#1E1E24] sm:text-5xl">
        ¿Qué vas a crear a continuación?
      </p>

      <form
        onSubmit={submit}
        className="mt-10 rounded-2xl border border-[#E7E2DA] bg-white px-4 pt-4 pb-3 shadow-[0_8px_30px_rgba(30,30,36,0.06)]"
      >
        <label htmlFor="office-idea" className="sr-only">
          Describe lo que quieres crear
        </label>
        <textarea
          id="office-idea"
          name="idea"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={2}
          placeholder={selected.placeholder}
          className="w-full resize-none bg-transparent text-base text-[#1E1E24] outline-none placeholder:text-[#8A8680] sm:text-lg"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Enfocar la idea"
              onClick={() => document.getElementById("office-idea")?.focus()}
              className="grid h-9 w-9 place-items-center text-[#1E1E24]"
            >
              <Plus className="h-5 w-5" />
            </button>
            <label className="inline-flex items-center gap-1 px-2 text-sm text-[#1E1E24]">
              <span className="sr-only">Tipo</span>
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as (typeof kinds)[number]["id"])}
                className="appearance-none bg-transparent pr-1 outline-none"
              >
                {kinds.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="h-4 w-4" aria-hidden />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={pending} className="px-2 text-sm text-[#1E1E24]">
              Crear
            </button>
            <button
              type="submit"
              aria-label="Enviar"
              disabled={pending}
              className="grid h-9 w-9 place-items-center rounded-lg bg-[#7C3AED] text-white transition-colors hover:bg-[#6D28D9] disabled:opacity-50"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </form>
      {error ? <p className="mt-3 text-center text-sm text-[#9A3B2F]">{error}</p> : null}

      <section className="mt-16">
        <h2 className="text-sm font-medium text-[#5C5854]">Tus proyectos</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {projects.length > 0
            ? projects.slice(0, 3).map((project) => (
                <Link
                  key={project.id}
                  href={`/dashboard/projects/${project.id}`}
                  className="rounded-2xl border border-[#E7E2DA] bg-white p-4 transition-colors hover:border-[#C4B5FD]"
                >
                  <p className="text-xs text-[#7C3AED]">{projectKindLabel[projectKind(project.kind)]}</p>
                  <p className="mt-1 font-medium text-[#1E1E24]">{project.title}</p>
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[#5C5854]">{project.idea}</p>
                </Link>
              ))
            : starters.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => {
                    setKind(item.kind);
                    setDraft(item.idea);
                    setError("");
                  }}
                  className="rounded-2xl border border-[#E7E2DA] bg-white p-4 text-left transition-colors hover:border-[#C4B5FD]"
                >
                  <p className="font-medium text-[#1E1E24]">{item.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[#5C5854]">{item.idea}</p>
                </button>
              ))}
        </div>
      </section>
    </div>
  );
}
