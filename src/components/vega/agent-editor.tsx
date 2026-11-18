"use client";

import { Trash2, X } from "lucide-react";
import { useEffect, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { AgentMascot } from "@/components/vega/agent-mascot";
import type { Persona } from "@/lib/vega/agent-scope";
import { colorLabels, encodeMascot, mascotColors, mascotOf, mascotPalette, pickableShapes, shapeLabels, type Mascot } from "@/lib/vega/mascot";
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
    <div className="space-y-3 rounded-3xl bg-[#F6F5F2] p-4 dark:bg-white/[0.04]">
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

/** Mascota del agente: forma y color, guardados como código corto en el campo «avatar». */
function MascotPicker({ draft, onChange }: { draft: AgentDraft; onChange: (draft: AgentDraft) => void }) {
  const seed = draft.id ?? draft.name;
  const current = mascotOf({ id: draft.id, name: draft.name, avatar: draft.avatar, isDefault: draft.isDefault });
  const pick = (next: Partial<Mascot>) => onChange({ ...draft, avatar: encodeMascot({ ...current, ...next }) });
  const shapes = draft.isDefault ? (["vega"] as const) : pickableShapes;

  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl bg-[#F6F5F2] p-4 sm:flex-row sm:items-center dark:bg-white/[0.04]">
      <div className="grid size-24 shrink-0 place-items-center rounded-[28px] bg-white shadow-sm ring-1 ring-black/[0.04] dark:bg-[#211E2B] dark:ring-white/8">
        <AgentMascot mascot={current} seed={seed} mood="happy" className="size-20" title={`Mascota de ${draft.name || "tu agente"}`} />
      </div>
      <div className="w-full min-w-0 space-y-3">
        {draft.isDefault ? (
          <p className="text-xs text-[#8A8680]">Vega conserva su forma; puedes cambiarle el color.</p>
        ) : (
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-[#5C5854] dark:text-[#C7C2D3]">Forma</legend>
            <div className="flex flex-wrap gap-1.5">
              {shapes.map((shape) => (
                <button
                  key={shape}
                  type="button"
                  onClick={() => pick({ shape })}
                  aria-pressed={current.shape === shape}
                  aria-label={shapeLabels[shape]}
                  title={shapeLabels[shape]}
                  className={cn(
                    "grid size-11 place-items-center rounded-2xl transition focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none",
                    current.shape === shape ? "bg-white shadow-sm ring-2 ring-[#7C3AED] dark:bg-[#2A2636]" : "hover:bg-white dark:hover:bg-white/10",
                  )}
                >
                  <AgentMascot mascot={{ shape, color: current.color }} seed={seed} still className="size-8" />
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-[#5C5854] dark:text-[#C7C2D3]">Color</legend>
          <div className="flex flex-wrap gap-2">
            {mascotColors.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => pick({ color })}
                aria-pressed={current.color === color}
                aria-label={colorLabels[color]}
                title={colorLabels[color]}
                className={cn(
                  "size-8 rounded-full ring-offset-2 ring-offset-[#F6F5F2] transition focus-visible:outline-none dark:ring-offset-[#1C1A26]",
                  current.color === color ? "ring-2 ring-[#1E1E24] dark:ring-white" : "hover:scale-110",
                )}
                style={{ background: `linear-gradient(135deg, ${mascotPalette[color].light}, ${mascotPalette[color].base} 55%, ${mascotPalette[color].deep})` }}
              />
            ))}
          </div>
        </fieldset>
      </div>
    </div>
  );
}

const field =
  "w-full rounded-2xl border border-transparent bg-[#F6F5F2] px-3.5 py-2.5 text-[#1E1E24] outline-none transition focus:border-[#7C3AED] focus:bg-white focus:ring-4 focus:ring-[#7C3AED]/15 dark:bg-white/[0.05] dark:text-white dark:focus:bg-white/[0.08]";
const label = "block space-y-1.5 text-sm font-medium text-[#5C5854] dark:text-[#C7C2D3]";

/** Crear o editar un agente (nombre, especialidad, personalidad y avatar). */
export function AgentEditor({
  draft,
  saving,
  onChange,
  onCancel,
  onSubmit,
  onDelete,
  extra,
}: {
  draft: AgentDraft;
  saving: boolean;
  onChange: (draft: AgentDraft) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** Solo para agentes creados por el socio (Vega no se elimina). */
  onDelete?: () => void;
  extra?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, saving]);

  // En móvil el chat de Vega es una capa fija: el diálogo va al <body> para quedar sobre las pestañas.
  // Solo se abre tras un toque, así que siempre hay documento; la guarda es por si acaso.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-end bg-black/50 backdrop-blur-sm sm:place-items-center sm:p-4" role="presentation">
      <form
        onSubmit={onSubmit}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px] dark:bg-[#1C1A26] dark:ring-1 dark:ring-white/8"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vega-agent-title"
      >
        <div className="relative overflow-hidden px-5 pt-5 pb-4">
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <h2 id="vega-agent-title" className="text-lg font-semibold text-[#1E1E24] dark:text-white">
                {draft.id ? (draft.isDefault ? "Ajustar a Vega" : `Editar a ${draft.name || "tu agente"}`) : "Crear agente"}
              </h2>
              <p className="mt-1 text-sm text-[#8A8680]">
                {draft.isDefault
                  ? "Vega es tu agente principal: puedes cambiar su color, especialidad y personalidad."
                  : "Tendrá su propio nombre, personalidad, memoria y rutinas. Usa las mismas conexiones y créditos que Vega."}
              </p>
            </div>
            <button type="button" onClick={onCancel} disabled={saving} className="rounded-full p-1.5 text-[#8A8680] hover:bg-[#F3F0EB] dark:hover:bg-white/10" aria-label="Cerrar">
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="space-y-4 px-5 pb-5">
          <MascotPicker draft={draft} onChange={onChange} />
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
          <div className="flex items-center justify-end gap-2 pt-1">
            {onDelete ? (
              <button
                type="button"
                disabled={saving}
                onClick={onDelete}
                className="mr-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-50 dark:text-[#FCA5A5] dark:hover:bg-red-500/10"
              >
                <Trash2 className="size-4" /> Eliminar
              </button>
            ) : null}
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
    </div>,
    document.body,
  );
}
