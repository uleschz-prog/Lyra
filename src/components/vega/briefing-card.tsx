"use client";

import { Check, Sparkles, WandSparkles } from "lucide-react";
import { useState } from "react";
import { briefKindLabels, briefQuestions, composeBriefPrompt, type BriefRequest } from "@/lib/vega/briefing";
import { cn } from "@/lib/utils";

/** Formulario guiado del briefing: opciones sugeridas + texto libre. Al enviar, manda las respuestas a Vega. */
export function BriefingCard({
  request,
  disabled,
  onSubmit,
}: {
  request: BriefRequest;
  disabled?: boolean;
  onSubmit: (text: string) => void;
}) {
  const all = briefQuestions[request.kind];
  // Si el servidor dijo qué falta, solo se pregunta eso; si viene de un botón rápido, todas (3–5).
  const questions = request.missing.length ? all.filter((question) => request.missing.includes(question.key)) : all;
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);

  const answerOf = (key: string) => [...(picked[key] ?? []), typed[key]?.trim() ?? ""].filter(Boolean).join(", ");
  const ready = questions.every((question) => !question.required || answerOf(question.key).length >= 2);
  const locked = disabled || sent;

  function toggle(key: string, option: string, multi?: boolean) {
    setPicked((current) => {
      const list = current[key] ?? [];
      const has = list.includes(option);
      const next = multi ? (has ? list.filter((item) => item !== option) : [...list, option]) : has ? [] : [option];
      return { ...current, [key]: next };
    });
  }

  function submit(delegate: boolean) {
    const answers = Object.fromEntries(all.map((question) => [question.key, answerOf(question.key)]));
    setSent(true);
    onSubmit(composeBriefPrompt(request.kind, answers, { delegate }));
  }

  return (
    <div className="mt-3 rounded-2xl border border-[#E7E2F7] bg-white p-4 shadow-[0_10px_30px_-20px_rgba(76,29,149,0.45)]" data-testid="briefing-card">
      <p className="flex items-center gap-2 text-sm font-semibold text-[#1E1E24]">
        <Sparkles className="size-4 text-[#7C3AED]" />
        Antes de crear tu {briefKindLabels[request.kind]}
      </p>
      <p className="mt-0.5 text-xs text-[#8A8680]">Elige una opción o escribe la tuya. Lo marcado con * es necesario.</p>
      <div className="mt-3 space-y-3.5">
        {questions.map((question) => (
          <fieldset key={question.key} disabled={locked} className="space-y-1.5">
            <legend className="text-[13px] font-medium text-[#1E1E24]">
              {question.question}
              {question.required ? <span className="text-[#7C3AED]"> *</span> : null}
            </legend>
            {question.options.length ? (
              <div className="flex flex-wrap gap-1.5">
                {question.options.map((option) => {
                  const on = picked[question.key]?.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(question.key, option, question.multi)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition disabled:opacity-60",
                        on ? "border-[#7C3AED] bg-[#7C3AED] text-white" : "border-[#E5E1EC] bg-[#FAF9FC] text-[#4B4757] hover:border-[#C4B5FD]",
                      )}
                    >
                      {on ? <Check className="size-3" /> : null}
                      {option}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <input
              value={typed[question.key] ?? ""}
              onChange={(event) => setTyped((current) => ({ ...current, [question.key]: event.target.value }))}
              placeholder={question.placeholder ?? (question.options.length ? "Otra (escribe)…" : "Escribe tu respuesta…")}
              aria-label={question.question}
              maxLength={600}
              className="w-full rounded-xl border border-[#E5E1EC] bg-[#FAF9FC] px-3 py-2 text-[13px] text-[#1E1E24] outline-none placeholder:text-[#A9A4B3] focus:border-[#A78BFA] disabled:opacity-60"
            />
          </fieldset>
        ))}
      </div>
      {sent ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-[#7C3AED]">
          <Check className="size-3.5" /> Respuestas enviadas a Vega.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={locked || !ready}
            onClick={() => submit(false)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#1E1E24] px-4 py-2 text-xs font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles className="size-3.5" /> Crear con mis respuestas
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => submit(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E1EC] px-3.5 py-2 text-xs text-[#4B4757] transition hover:border-[#C4B5FD] disabled:opacity-40"
          >
            <WandSparkles className="size-3.5" /> Tú decide lo que falte
          </button>
        </div>
      )}
    </div>
  );
}
