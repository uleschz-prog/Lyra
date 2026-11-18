"use client";

import { X } from "lucide-react";
import { useEffect, type FormEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type AgentDraft = { id?: string; isDefault?: boolean; name: string; specialty: string; instructions: string; avatar: string };

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
                  : "Tendrá su propio nombre, especialidad y personalidad. Usa las mismas conexiones que Vega."}
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
