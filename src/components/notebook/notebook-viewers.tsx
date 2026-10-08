"use client";

import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useState } from "react";

import type { DataTable, Deck, FlashDeck, Infographic, MindMap, Report, Slide, StudyQuiz } from "@/lib/notebook/artifacts";
import { cn } from "@/lib/utils";

export function SlideStage({
  deck,
  index,
  editing,
  onIndex,
  onChange,
  onTitle,
}: {
  deck: Deck;
  index: number;
  editing: boolean;
  onIndex: (index: number) => void;
  onChange: (patch: Partial<Slide>) => void;
  onTitle: (title: string) => void;
}) {
  const slide = deck.slides[index] ?? deck.slides[0];
  const last = deck.slides.length - 1;

  return (
    <section className="overflow-hidden rounded-3xl bg-[#0B0A10] text-white shadow-[0_24px_80px_-32px_rgba(124,58,237,0.65)]">
      <div className="flex items-center justify-between gap-3 px-6 pt-5">
        <p className="text-xs uppercase tracking-[0.22em] text-[#C4B5FD]">{deck.title}</p>
        <p className="text-xs tabular-nums text-white/60">
          {String(index + 1).padStart(2, "0")} / {String(deck.slides.length).padStart(2, "0")}
        </p>
      </div>
      <div className="grid min-h-[340px] gap-8 px-6 py-8 sm:px-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)] lg:items-end">
        <div>
          {slide.kicker ? <p className="text-sm text-[#22D3EE]">{slide.kicker}</p> : null}
          <h3 className="mt-3 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">{slide.title}</h3>
        </div>
        <div>
          {slide.points.length > 0 ? (
            <ul className="space-y-3">
              {slide.points.map((point) => (
                <li key={point} className="border-l-2 border-[#7C3AED] pl-4 text-base leading-7 text-white/90">
                  {point}
                </li>
              ))}
            </ul>
          ) : null}
          {slide.note ? <p className="mt-6 text-sm leading-6 text-white/55">{slide.note}</p> : null}
          {editing ? (
            <div className="mt-6 space-y-2 text-[#1E1E24]">
              <input value={deck.title} onChange={(event) => onTitle(event.target.value)} aria-label="Título de la presentación" className="w-full rounded-lg bg-white px-3 py-2 text-sm" />
              <input value={slide.title} onChange={(event) => onChange({ title: event.target.value })} aria-label="Título de la lámina" className="w-full rounded-lg bg-white px-3 py-2 text-sm" />
              <textarea
                value={slide.points.join("\n")}
                onChange={(event) =>
                  onChange({
                    points: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 4),
                  })
                }
                rows={3}
                aria-label="Puntos de la lámina"
                className="w-full resize-none rounded-lg bg-white px-3 py-2 text-sm"
              />
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-white/10 px-6 py-4">
        <div className="flex gap-1.5">
          {deck.slides.map((item, dot) => (
            <button
              key={`${item.title}-${dot}`}
              type="button"
              aria-label={`Ir a la diapositiva ${dot + 1}`}
              onClick={() => onIndex(dot)}
              className={cn("h-1.5 rounded-full", dot === index ? "w-6 bg-[#7C3AED]" : "w-1.5 bg-white/30")}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" aria-label="Diapositiva anterior" disabled={index === 0} onClick={() => onIndex(Math.max(0, index - 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 disabled:opacity-30">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Diapositiva siguiente" disabled={index === last} onClick={() => onIndex(Math.min(last, index + 1))} className="grid h-9 w-9 place-items-center rounded-lg bg-[#7C3AED] disabled:opacity-30">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

export function VideoStage({
  script,
  videoUrl,
  message,
  editing,
  onScript,
}: {
  script: string;
  videoUrl?: string | null;
  message?: string;
  editing: boolean;
  onScript: (script: string) => void;
}) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
      <p className="text-xs uppercase tracking-[0.18em] text-[#7C3AED]">Resumen en video</p>
      {message ? <p className="mt-2 text-sm text-muted">{message}</p> : null}
      {editing ? (
        <textarea value={script} onChange={(event) => onScript(event.target.value)} rows={5} aria-label="Guion del video" className="mt-4 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-[#7C3AED]" />
      ) : script ? (
        <p className="mt-4 max-w-3xl text-base leading-7 text-foreground">{script}</p>
      ) : null}
      {videoUrl ? <video controls src={videoUrl} className="mt-5 aspect-video w-full rounded-2xl bg-black" /> : null}
    </section>
  );
}

export function AudioStage({
  script,
  note,
  audioUrl,
  editing,
  onScript,
}: {
  script: string;
  note: string;
  audioUrl: string | null;
  editing: boolean;
  onScript: (script: string) => void;
}) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
      <p className="text-xs uppercase tracking-[0.18em] text-[#06B6D4]">Resumen en audio</p>
      <p className="mt-2 text-sm text-muted">{note}</p>
      {audioUrl ? <audio controls src={audioUrl} className="mt-4 w-full" /> : null}
      {editing ? (
        <textarea value={script} onChange={(event) => onScript(event.target.value)} rows={6} aria-label="Guion del audio" className="mt-4 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-[#7C3AED]" />
      ) : (
        <p className="mt-4 max-w-3xl text-base leading-7 text-foreground">{script}</p>
      )}
    </section>
  );
}

export function MindMapStage({ map }: { map: MindMap }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
      <p className="text-xs uppercase tracking-[0.18em] text-[#7C3AED]">{map.title}</p>
      <div className="mx-auto mt-6 grid max-w-3xl place-items-center">
        <p className="rounded-full bg-[#7C3AED] px-5 py-3 text-sm font-medium text-white shadow-[0_12px_40px_-16px_rgba(124,58,237,0.9)]">{map.center}</p>
      </div>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {map.branches.map((branch) => (
          <li key={branch.label} className="rounded-2xl border border-border bg-background/60 p-4">
            <p className="text-sm font-medium text-foreground">{branch.label}</p>
            {branch.detail ? <p className="mt-1 text-sm leading-6 text-muted">{branch.detail}</p> : null}
            {branch.leaves.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {branch.leaves.map((leaf) => (
                  <li key={leaf} className="rounded-full border border-[#06B6D4]/40 bg-[#06B6D4]/10 px-2.5 py-1 text-xs text-foreground">
                    {leaf}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ReportStage({ report }: { report: Report }) {
  return (
    <article className="rounded-3xl border border-border bg-card px-6 py-8 sm:px-10">
      <p className="text-xs uppercase tracking-[0.22em] text-[#7C3AED]">Informe</p>
      <h3 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{report.title}</h3>
      {report.dek ? <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">{report.dek}</p> : null}
      <div className="mt-8 space-y-8">
        {report.sections.map((section, index) => (
          <section key={section.heading}>
            <p className="text-xs tabular-nums text-[#06B6D4]">{String(index + 1).padStart(2, "0")}</p>
            <h4 className="mt-1 text-xl font-medium text-foreground">{section.heading}</h4>
            <p className="mt-2 max-w-2xl text-base leading-7 text-foreground/90">{section.body}</p>
          </section>
        ))}
      </div>
    </article>
  );
}

export function CardsStage({ deck }: { deck: FlashDeck }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = deck.cards[index] ?? deck.cards[0];
  const last = deck.cards.length - 1;

  function go(next: number) {
    setIndex(next);
    setFlipped(false);
  }

  return (
    <section className="flex flex-col items-center px-2 py-4">
      <p className="text-xs uppercase tracking-[0.18em] text-[#7C3AED]">{deck.title}</p>
      <button
        type="button"
        onClick={() => setFlipped((current) => !current)}
        className="mt-6 grid min-h-64 w-full max-w-xl place-items-center rounded-3xl border border-border bg-[#0B0A10] px-8 py-10 text-center text-white shadow-[0_24px_80px_-32px_rgba(124,58,237,0.65)]"
        aria-label={flipped ? "Ver la pregunta" : "Ver la respuesta"}
      >
        <span className="text-xs uppercase tracking-[0.18em] text-[#C4B5FD]">{flipped ? "Respuesta" : "Pregunta"}</span>
        <span className="mt-4 text-2xl font-medium leading-snug">{flipped ? card.back : card.front}</span>
      </button>
      <div className="mt-5 flex items-center gap-3">
        <button type="button" aria-label="Tarjeta anterior" disabled={index === 0} onClick={() => go(Math.max(0, index - 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-border disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm tabular-nums text-muted">
          {index + 1} / {deck.cards.length}
        </p>
        <button type="button" aria-label="Tarjeta siguiente" disabled={index === last} onClick={() => go(Math.min(last, index + 1))} className="grid h-9 w-9 place-items-center rounded-lg bg-[#7C3AED] text-white disabled:opacity-30">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setFlipped((current) => !current)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Voltear
        </button>
      </div>
    </section>
  );
}

export function QuizStage({ quiz }: { quiz: StudyQuiz }) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const question = quiz.questions[index];

  if (done || !question) {
    return (
      <section className="rounded-3xl border border-border bg-card px-6 py-10 text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-[#7C3AED]">{quiz.title}</p>
        <p className="mt-4 text-4xl font-semibold tabular-nums text-foreground">
          {score}/{quiz.questions.length}
        </p>
        <p className="mt-2 text-sm text-muted">Respuestas correctas</p>
        <button
          type="button"
          className="mt-6 rounded-full bg-[#7C3AED] px-4 py-2 text-sm text-white"
          onClick={() => {
            setIndex(0);
            setPicked(null);
            setScore(0);
            setDone(false);
          }}
        >
          Repetir
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.18em] text-[#7C3AED]">{quiz.title}</p>
        <p className="text-xs tabular-nums text-muted">
          {index + 1} / {quiz.questions.length}
        </p>
      </div>
      <h3 className="mt-4 text-xl font-medium leading-snug text-foreground">{question.prompt}</h3>
      <ul className="mt-5 space-y-2">
        {question.choices.map((choice, choiceIndex) => {
          const revealed = picked !== null;
          const correct = choiceIndex === question.answer;
          const selected = picked === choiceIndex;
          return (
            <li key={choice}>
              <button
                type="button"
                disabled={revealed}
                onClick={() => {
                  setPicked(choiceIndex);
                  if (choiceIndex === question.answer) setScore((current) => current + 1);
                }}
                className={cn(
                  "w-full rounded-2xl border px-4 py-3 text-left text-sm leading-6",
                  !revealed && "border-border hover:border-[#7C3AED]",
                  revealed && correct && "border-[#10B981] bg-[#10B981]/10",
                  revealed && selected && !correct && "border-[#F43F5E] bg-[#F43F5E]/10",
                  revealed && !selected && !correct && "border-border opacity-60",
                )}
              >
                {choice}
              </button>
            </li>
          );
        })}
      </ul>
      {picked !== null ? (
        <div className="mt-4">
          {question.why ? <p className="text-sm leading-6 text-muted">{question.why}</p> : null}
          <button
            type="button"
            className="mt-4 rounded-full bg-[#7C3AED] px-4 py-2 text-sm text-white"
            onClick={() => {
              if (index + 1 >= quiz.questions.length) setDone(true);
              else {
                setIndex((current) => current + 1);
                setPicked(null);
              }
            }}
          >
            {index + 1 >= quiz.questions.length ? "Ver resultado" : "Siguiente"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function InfographicStage({ piece }: { piece: Infographic }) {
  return (
    <section className="overflow-hidden rounded-3xl bg-[#0B0A10] text-white shadow-[0_24px_80px_-32px_rgba(6,182,212,0.45)]">
      <div className="bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.45),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(6,182,212,0.28),transparent_40%)] px-6 py-8 sm:px-10">
        <p className="text-xs uppercase tracking-[0.22em] text-[#C4B5FD]">Infografía</p>
        <h3 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">{piece.title}</h3>
        {piece.subtitle ? <p className="mt-3 max-w-xl text-base leading-7 text-white/70">{piece.subtitle}</p> : null}
        {piece.stats.length > 0 ? (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {piece.stats.map((stat) => (
              <li key={`${stat.value}-${stat.label}`} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                <p className="text-3xl font-semibold tracking-tight text-[#22D3EE]">{stat.value}</p>
                <p className="mt-1 text-sm text-white/75">{stat.label}</p>
              </li>
            ))}
          </ul>
        ) : null}
        {piece.points.length > 0 ? (
          <ol className="mt-6 space-y-3">
            {piece.points.map((point, index) => (
              <li key={point.title} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[#7C3AED] text-xs">{index + 1}</span>
                <span>
                  <span className="block text-sm font-medium">{point.title}</span>
                  <span className="mt-1 block text-sm leading-6 text-white/70">{point.text}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </section>
  );
}

export function TableStage({ table }: { table: DataTable }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-card">
      <div className="px-5 py-4">
        <p className="text-xs uppercase tracking-[0.18em] text-[#7C3AED]">Tabla de datos</p>
        <h3 className="mt-1 text-lg font-medium text-foreground">{table.title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-y border-border bg-[#7C3AED]/10">
              {table.columns.map((column) => (
                <th key={column} className="px-4 py-3 font-medium text-foreground">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={row.join("|")} className={cn("border-b border-border", rowIndex % 2 === 1 && "bg-background/40")}>
                {row.map((cell, cellIndex) => (
                  <td key={`${table.columns[cellIndex]}-${cell}`} className="px-4 py-3 text-foreground/90">
                    {cell || "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
