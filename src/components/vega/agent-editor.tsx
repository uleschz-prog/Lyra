"use client";

import { X } from "lucide-react";
import { useEffect, type FormEvent, type ReactNode } from "react";

import type { Persona } from "@/lib/vega/agent-scope";
import { cn } from "@/lib/utils";

export type AgentDraft = {
  id?: string;
  isDefault?: boolean;
  name: string;
  specialty: string;
  instructions: string;
  avatar: string;
  /** Vega v2 · V3: personalidad. */
  persona?: Persona;
};

type Choice<T extends string> = { value: T | undefined; label: string };

const toneChoices: Choice<NonNullable<Persona["tone"]>>[] = [
  { value: undefined, label: "Como Vega" },
  { value: "cercano", label: "Cercano" },
  { value: "profesional", label: "Profesional" },
  { value: "entusiasta", label: "Entusiasta" },
  { value: "directo", label: "Directo" },
];
const addressChoices: Choice<NonNullable<Persona["address"]>>[] = [
  { value: undefined, label: "Como Vega" },
  { value: "tu", label: "De tú" },
  { value: "usted", label: "De usted" },
];
const emojiChoices: Choice<NonNullable<Persona["emojis"]>>[] = [
  { value: undefined, label: "Como Vega" },
  { value: "no", label: "Sin emojis" },
  { value: "pocos", label: "Pocos" },
  { value: "si", label: "Con gusto" },
];
const lengthChoices: Choice<NonNullable<Persona["length"]>>[] = [
  { value: undefined, label: "Como Vega" },
  { value: "breve", label: "Breves" },
  { value: "detallada", label: "Detalladas" },
];

function Segmented<T extends string>({
  legend,
  choices,
  value,
  onPick,
}: {
  legend: string;
  choices: Choice<T>[];
  value: T | undefined;
  onPick: (value: T | undefined) => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-medium text-[#5C5854] dark:text-[#C7C2D3]">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {choices.map((choice) => {
          const active = choice.value === value;
          return (
            <button
              key={choice.label}
              type="button"
              aria-pressed={active}
              onClick={() => onPick(choice.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none",
                active
                  ? "border-transparent bg-[linear-gradient(135deg,#7C3AED,#06B6D4)] text-white"
                  : "border-[#E7E2DA] text-[#5C5854] hover:border-[#C4B5FD] dark:border-white/15 dark:text-[#C7C2D3]",
              )}
            >
              {choice.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Personalidad del agente: tono, trato, emojis, extensión y reglas propias. */
function PersonaFields({ persona, onChange }: { persona: Persona; onChange: (persona: Persona) => void }) {
  return (
    <div className="space-y-3 rounded-2xl border border-[#EEE9E2] bg-[#FCFBF9] p-3.5 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="text-sm font-semibold text-[#1E1E24] dark:text-white">Personalidad</p>
      <Segmented legend="Tono" choices={toneChoices} value={persona.tone} onPick={(tone) => onChange({ ...persona, tone })} />
      <Segmented legend="Trato" choices={addressChoices} value={persona.address} onPick={(address) => onChange({ ...persona, address })} />
      <Segmented legend="Emojis" choices={emojiChoices} value={persona.emojis} onPick={(emojis) => onChange({ ...persona, emojis })} />
      <Segmented legend="Respuestas" choices={lengthChoices} value={persona.length} onPick={(length) => onChange({ ...persona, length })} />
      <label className="block space-y-1.5 text-xs font-medium text-[#5C5854] dark:text-[#C7C2D3]">
        Reglas propias (opcional)
        <textarea
          maxLength={600}
          rows={2}
          value={persona.rules ?? ""}
          onChange={(event) => onChange({ ...persona, rules: event.target.value })}
          className={cn(field, "resize-y text-sm")}
          placeholder="Ej.: nunca prometas fechas de entrega; firma como «Equipo Lyra»."
        />
      </label>
    </div>
  );
}

export const avatarChoices = ["✦", "🤖", "🦊", "🦉", "🚀", "💼", "📣", "🎯", "🧠", "🌱", "💬", "📊"];

const field =
  "w-full rounded-xl border border-[#E7E2DA] bg-white px-3 py-2.5 text-[#1E1E24] outline-none transition focus:border-[#7C3AED] focus:ring-4 focus:ring-[#7C3AED]/15 dark:border-white/15 dark:bg-[#0B0A10] dark:text-white";
const label = "block space-y-1.5 text-sm font-medium text-[#5C5854] dark:text-[#C7C2D3]";

/** Crear o editar un agente (nombre, especialidad, personalidad y avatar). */
export function AgentEditor({
  draft,
  saving,
  onChange,
  onCancel,
  onSubmit,
  extra,
}: {
  draft: AgentDraft;
  saving: boolean;
  onChange: (draft: AgentDraft) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  extra?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, saving]);

  return (
    <div className="fixed inset-0 z-[80] grid place-items-end bg-black/50 backdrop-blur-sm sm:place-items-center sm:p-4" role="presentation">
      <form
        onSubmit={onSubmit}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[#E7E2DA] bg-white shadow-2xl sm:rounded-3xl dark:border-white/10 dark:bg-[#181625]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vega-agent-title"
      >
        <div className="relative overflow-hidden px-5 pt-5 pb-4">
          <span className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(ellipse_at_20%_0%,rgba(124,58,237,0.22),transparent_60%),radial-gradient(ellipse_at_90%_0%,rgba(6,182,212,0.18),transparent_55%)]" aria-hidden />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <h2 id="vega-agent-title" className="text-lg font-semibold text-[#1E1E24] dark:text-white">
                {draft.id ? (draft.isDefault ? "Ajustar a Vega" : `Editar a ${draft.name || "tu agente"}`) : "Crear agente"}
              </h2>
              <p className="mt-1 text-sm text-[#8A8680]">
                {draft.isDefault
                  ? "Vega es tu agente principal: puedes cambiar su avatar, especialidad y personalidad."
                  : "Tendrá su propio nombre, personalidad, memoria y rutinas. Usa las mismas conexiones y créditos que Vega."}
              </p>
            </div>
            <button type="button" onClick={onCancel} disabled={saving} className="rounded-full p-1.5 text-[#8A8680] hover:bg-[#F3F0EB] dark:hover:bg-white/10" aria-label="Cerrar">
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="space-y-4 px-5 pb-5">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-[#5C5854] dark:text-[#C7C2D3]">Avatar</legend>
            <div className="flex flex-wrap gap-2">
              {avatarChoices.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onChange({ ...draft, avatar: emoji })}
                  aria-pressed={draft.avatar === emoji}
                  aria-label={`Avatar ${emoji}`}
                  className={cn(
                    "grid size-10 place-items-center rounded-full border text-lg transition",
                    draft.avatar === emoji
                      ? "border-transparent bg-[linear-gradient(135deg,#7C3AED,#06B6D4)] text-white shadow-[0_8px_20px_-8px_rgba(124,58,237,0.8)]"
                      : "border-[#E7E2DA] hover:border-[#C4B5FD] dark:border-white/15",
                  )}
                >
                  {emoji}
                </button>
              ))}
              <input
                maxLength={8}
                value={avatarChoices.includes(draft.avatar) ? "" : draft.avatar}
                onChange={(event) => onChange({ ...draft, avatar: event.target.value || "✦" })}
                aria-label="Otro emoji"
                placeholder="Otro"
                className="h-10 w-16 rounded-full border border-[#E7E2DA] bg-white text-center text-sm outline-none focus:border-[#7C3AED] dark:border-white/15 dark:bg-[#0B0A10] dark:text-white"
              />
            </div>
          </fieldset>
          <label className={label}>
            Nombre
            <input
              autoFocus={!draft.isDefault}
              required
              maxLength={40}
              disabled={draft.isDefault}
              value={draft.name}
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
              className={cn(field, draft.isDefault && "opacity-60")}
              placeholder="Ej. Luna"
            />
          </label>
          <label className={label}>
            Especialidad
            <input
              required
              maxLength={80}
              value={draft.specialty}
              onChange={(event) => onChange({ ...draft, specialty: event.target.value })}
              className={field}
              placeholder="Ej. Marketing y redes sociales"
            />
          </label>
          <label className={label}>
            Instrucciones y personalidad
            <textarea
              maxLength={2000}
              rows={4}
              value={draft.instructions}
              onChange={(event) => onChange({ ...draft, instructions: event.target.value })}
              className={cn(field, "resize-y")}
              placeholder="Define su tono, enfoque y cómo debe ayudarte."
            />
          </label>
          <PersonaFields persona={draft.persona ?? {}} onChange={(persona) => onChange({ ...draft, persona })} />
          {extra}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" disabled={saving} onClick={onCancel} className="rounded-xl px-4 py-2 text-sm text-[#5C5854] hover:bg-[#F3F0EB] disabled:opacity-50 dark:text-[#C7C2D3] dark:hover:bg-white/10">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[linear-gradient(135deg,#7C3AED,#6D28D9)] px-4 py-2 text-sm font-medium text-white shadow-[0_10px_24px_-12px_rgba(124,58,237,0.9)] hover:brightness-110 disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar agente"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
