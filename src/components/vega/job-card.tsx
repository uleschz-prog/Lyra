"use client";

import { Ban, Check, CircleDashed, LoaderCircle, Minus, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { VegaActionView } from "@/lib/vega/events";
import { jobDraftOf, type JobStepState, type JobView } from "@/lib/vega/jobs-core";
import { cn } from "@/lib/utils";

const stepIcon: Record<JobStepState, typeof Check> = {
  pending: CircleDashed,
  running: LoaderCircle,
  done: Check,
  failed: TriangleAlert,
  skipped: Minus,
};

/**
 * Tarjeta de un trabajo en segundo plano. Mientras siga activo, cada POST avanza un paso
 * corto en el servidor; el socio puede seguir platicando o cancelarlo.
 */
export function JobCard({ action, onChange }: { action: VegaActionView; onChange: (action: VegaActionView, message: string) => void }) {
  const draft = jobDraftOf(action.payload);
  const [view, setView] = useState<JobView | null>(null);
  const [canceling, setCanceling] = useState(false);
  const onChangeRef = useRef(onChange);
  const running = action.status === "running" || action.status === "pending";

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!draft?.jobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const settle = (job: JobView) => {
      const status = job.status === "done" ? "done" : job.status === "canceled" ? "cancelled" : "failed";
      const result =
        job.status === "done"
          ? `Terminado: ${job.title}.`
          : job.status === "canceled"
            ? `Cancelado: ${job.title}.`
            : `No se pudo terminar: ${job.title}.`;
      const message =
        job.status === "done"
          ? (job.result ?? "")
          : job.status === "failed"
            ? `No pude terminar «${job.title}». ${job.error ?? ""} Los pasos que no se completaron no se cobraron.`.trim()
            : "";
      onChangeRef.current({ ...action, status, result }, message);
    };
    const tick = async (advance: boolean) => {
      try {
        const response = await fetch(`/api/vega/jobs/${encodeURIComponent(draft.jobId)}`, { method: advance ? "POST" : "GET", cache: "no-store" });
        if (cancelled) return;
        const payload = (await response.json().catch(() => ({}))) as { job?: JobView; advanced?: boolean; error?: string };
        if (!response.ok || !payload.job) throw new Error(payload.error ?? "sin respuesta");
        failures = 0;
        setView(payload.job);
        if (payload.job.status === "done" || payload.job.status === "failed" || payload.job.status === "canceled") {
          if (running) settle(payload.job);
          return;
        }
        // Si otra invocación tiene el trabajo (p. ej. after()), espera un poco antes de volver a intentar.
        timer = setTimeout(() => void tick(true), payload.advanced ? 600 : 3_000);
      } catch {
        if (cancelled) return;
        failures += 1;
        timer = setTimeout(() => void tick(true), Math.min(15_000, 2_000 * failures));
      }
    };
    // Al abrir: si ya terminó, solo lee el estado; si sigue, lo avanza.
    void tick(running);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Solo se reinicia si cambia el trabajo o su estado en la tarjeta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.jobId, running]);

  async function cancel() {
    if (!draft?.jobId || canceling) return;
    setCanceling(true);
    try {
      const response = await fetch(`/api/vega/jobs/${encodeURIComponent(draft.jobId)}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as { job?: JobView };
      if (!response.ok || !payload.job) throw new Error("cancel");
      setView(payload.job);
      if (payload.job.status === "canceled") onChangeRef.current({ ...action, status: "cancelled", result: `Cancelado: ${payload.job.title}.` }, "");
      else toast.message("Se detendrá en cuanto termine el paso en curso.");
    } catch {
      toast.error("No se pudo cancelar. Intenta de nuevo.");
    } finally {
      setCanceling(false);
    }
  }

  if (!draft) return null;
  const steps = view?.steps ?? draft.steps.map((title) => ({ title, state: "pending" as JobStepState, preview: undefined }));
  const progress = view?.progress ?? (running ? 4 : 100);
  const status = view?.status ?? (running ? "queued" : action.status === "done" ? "done" : action.status === "cancelled" ? "canceled" : "failed");
  const active = status === "queued" || status === "running";
  const pendingCancel = Boolean(view?.cancelRequested) && active;

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-[#E7E2DA] bg-[#FCFBF9] dark:border-white/10 dark:bg-[#16131F]" aria-live="polite">
      <div className="flex items-center gap-3 px-4 pt-3.5">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-xl text-white",
            status === "done" ? "bg-[#10B981]" : status === "failed" ? "bg-[#DC2626]" : status === "canceled" ? "bg-[#8A8680]" : "bg-[linear-gradient(135deg,#7C3AED,#06B6D4)]",
          )}
          aria-hidden
        >
          {status === "done" ? <Check className="size-4" /> : status === "failed" ? <TriangleAlert className="size-4" /> : status === "canceled" ? <Ban className="size-4" /> : <LoaderCircle className="size-4 animate-spin" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[#1E1E24] dark:text-white">{draft.title}</p>
          <p className="text-xs text-[#8A8680]">
            {status === "done"
              ? "Trabajo terminado"
              : status === "failed"
                ? "No se pudo terminar"
                : status === "canceled"
                  ? "Cancelado"
                  : pendingCancel
                    ? "Cancelando al terminar el paso en curso…"
                    : "En segundo plano · puedes seguir platicando"}
          </p>
        </div>
        {active ? (
          <button
            type="button"
            onClick={() => void cancel()}
            disabled={canceling || pendingCancel}
            className="inline-flex items-center gap-1 rounded-full border border-[#E7E2DA] px-2.5 py-1 text-xs font-medium text-[#5C5854] hover:border-[#FCA5A5] hover:text-[#B42318] focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none disabled:opacity-50 dark:border-white/15"
          >
            <X className="size-3" /> Cancelar
          </button>
        ) : null}
      </div>
      <div className="mx-4 mt-3 h-1.5 overflow-hidden rounded-full bg-[#F0ECE6] dark:bg-white/10" role="progressbar" aria-label="Avance del trabajo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <div className="h-full rounded-full bg-[linear-gradient(90deg,#7C3AED,#06B6D4,#10B981)] transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
      <ol className="space-y-1.5 px-4 py-3">
        {steps.map((step, index) => {
          const Icon = stepIcon[step.state];
          return (
            <li key={`${index}-${step.title}`} className="flex gap-2 text-xs">
              <Icon
                className={cn(
                  "mt-0.5 size-3.5 shrink-0",
                  step.state === "done" && "text-[#10B981]",
                  step.state === "running" && "animate-spin text-[#06B6D4]",
                  step.state === "failed" && "text-[#DC2626]",
                  (step.state === "pending" || step.state === "skipped") && "text-[#A8A29E]",
                )}
                aria-hidden
              />
              <span className="min-w-0">
                <span className={cn("text-[#1E1E24] dark:text-[#ECEAF3]", step.state === "skipped" && "line-through opacity-60")}>
                  {index + 1}. {step.title}
                </span>
                <span className="sr-only"> · {step.state === "done" ? "hecho" : step.state === "running" ? "en curso" : step.state === "failed" ? "falló" : step.state === "skipped" ? "omitido" : "pendiente"}</span>
                {step.preview && step.state === "done" && index < steps.length - 1 ? <span className="mt-0.5 line-clamp-2 block text-[#8A8680]">{step.preview}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
      {active ? (
        <p className="border-t border-[#F0ECE6] px-4 py-2 text-[11px] text-[#8A8680] dark:border-white/8">
          Cada paso cuesta como un mensaje de Vega. Si cierras el chat, sigue en segundo plano y el resultado queda en esta conversación.
        </p>
      ) : view?.credits ? (
        <p className="border-t border-[#F0ECE6] px-4 py-2 text-[11px] text-[#8A8680] dark:border-white/8">Créditos usados: {view.credits}</p>
      ) : null}
    </div>
  );
}
