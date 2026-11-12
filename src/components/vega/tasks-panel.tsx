"use client";

import { CalendarClock, MessageCircle, Pause, Play, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  createVegaRoutine,
  deleteVegaTask,
  markVegaRoutineRunsSeen,
  saveVegaWhatsapp,
  toggleVegaTask,
  vegaRoutineRuns,
  vegaTasks,
  vegaWhatsapp,
} from "@/app/dashboard/super-agent/actions";
import { sheetClass } from "@/components/vega/sheet";
import { DEFAULT_TIMEZONE, MIN_INTERVAL_MINUTES, zonedParts } from "@/lib/vega/schedule";
import {
  DEFAULT_TIME,
  repeatLabels,
  runStatusLabels,
  type TaskKind,
  type TaskRepeat,
  type VegaRoutineRunView,
  type VegaTaskView,
} from "@/lib/vega/tasks-shared";
import { cn } from "@/lib/utils";

function formatWhen(iso: string, timeZone = DEFAULT_TIMEZONE) {
  return new Date(iso).toLocaleString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

function todayLocal() {
  const now = zonedParts(new Date(), DEFAULT_TIMEZONE);
  return `${now.year}-${String(now.month).padStart(2, "0")}-${String(now.day).padStart(2, "0")}`;
}

const fieldClass =
  "w-full rounded-lg border border-[#E7E2DA] bg-white px-3 py-1.5 text-base text-[#1E1E24] outline-none sm:text-xs focus:border-[#7C3AED]";

function NewRoutine({ onCreated }: { onCreated: (task: VegaTaskView) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [instruction, setInstruction] = useState("");
  const [kind, setKind] = useState<TaskKind>("reminder");
  const [repeat, setRepeat] = useState<TaskRepeat>("once");
  const [date, setDate] = useState(todayLocal);
  const [time, setTime] = useState(DEFAULT_TIME);
  const [cron, setCron] = useState("");

  async function submit() {
    setBusy(true);
    const result = await createVegaRoutine({ title, instruction, kind, repeat, date, time, cron });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onCreated(result.task);
    toast.success(`Rutina lista · ${result.task.label}`);
    setTitle("");
    setInstruction("");
    setCron("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2DA] px-3 py-1.5 text-xs font-medium text-[#1E1E24] hover:border-[#C4B5FD]"
      >
        <Plus className="size-3.5 text-[#7C3AED]" />
        Nueva rutina
      </button>
    );
  }

  return (
    <form
      className="mt-3 space-y-2 rounded-xl border border-[#F0ECE6] bg-[#FCFBF9] p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Título, p. ej. «Resumen de ventas»" className={fieldClass} maxLength={120} />
      <textarea
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        placeholder={kind === "task" ? "Qué debe hacer Vega cada vez (sin preguntas: tú no estarás en línea)" : "El mensaje que quieres recibir"}
        className={cn(fieldClass, "min-h-16 resize-y")}
        maxLength={1000}
      />
      <div className="grid grid-cols-2 gap-2">
        <select value={kind} onChange={(event) => setKind(event.target.value as TaskKind)} className={fieldClass} aria-label="Tipo">
          <option value="reminder">Recordatorio</option>
          <option value="task">Tarea de Vega</option>
        </select>
        <select value={repeat} onChange={(event) => setRepeat(event.target.value as TaskRepeat)} className={fieldClass} aria-label="Repetir">
          {(Object.keys(repeatLabels) as TaskRepeat[]).map((value) => (
            <option key={value} value={value}>
              {repeatLabels[value]}
            </option>
          ))}
        </select>
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={fieldClass} aria-label="Fecha" />
        <input type="time" value={time} onChange={(event) => setTime(event.target.value)} className={fieldClass} aria-label="Hora" step={60} />
      </div>
      {repeat === "custom" ? (
        <input
          value={cron}
          onChange={(event) => setCron(event.target.value)}
          placeholder="Cron: min hora día mes díaSemana, p. ej. 0 9,17 * * 1-5"
          className={cn(fieldClass, "font-mono")}
          maxLength={100}
        />
      ) : null}
      <p className="text-[11px] leading-4 text-[#A8A29E]">
        Hora de Ciudad de México. Mínimo {MIN_INTERVAL_MINUTES} minutos entre ejecuciones. Si Vega prepara un envío, te lo deja para confirmar.
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="px-2 text-xs text-[#8A8680]">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={busy || !title.trim() || !instruction.trim()}
          className="rounded-lg bg-[#1E1E24] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          Guardar
        </button>
      </div>
    </form>
  );
}

function RecentRuns({ runs }: { runs: VegaRoutineRunView[] }) {
  if (runs.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold text-[#1E1E24]">Últimas ejecuciones</p>
      <ul className="mt-1.5 space-y-1.5">
        {runs.map((run) => (
          <li key={run.id} className={cn("rounded-xl border px-3 py-2", run.seen ? "border-[#F0ECE6]" : "border-[#C4B5FD] bg-[#F5F3FF]")}>
            <p className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium text-[#1E1E24]">{run.title}</span>
              <span className={cn("shrink-0", run.status === "failed" ? "text-[#B42318]" : "text-[#8A8680]")}>
                {runStatusLabels[run.status]} · {formatWhen(run.scheduledFor)}
              </span>
            </p>
            {run.result ? <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-xs text-[#5C5854]">{run.result}</p> : null}
            {run.pendingActions > 0 ? (
              <p className="mt-0.5 text-xs font-medium text-[#7C3AED]">
                {run.pendingActions === 1 ? "1 acción espera tu confirmación" : `${run.pendingActions} acciones esperan tu confirmación`} en «Recordatorios de Vega».
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function WhatsappReminders() {
  const [phone, setPhone] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void vegaWhatsapp().then((value) => {
      if (alive) setPhone(value);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function save(value: string | null) {
    setBusy(true);
    const result = await saveVegaWhatsapp(value);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setPhone(result.phone);
    setDraft("");
    toast.success(result.phone ? "Tus avisos también llegarán por WhatsApp" : "Avisos por WhatsApp desactivados");
  }

  if (phone === undefined) return null;

  return (
    <div className="mt-3 rounded-xl border border-[#F0ECE6] bg-[#FCFBF9] p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-[#1E1E24]">
        <MessageCircle className="size-3.5 text-[#16A34A]" />
        Recibir también por WhatsApp
      </p>
      {phone ? (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="text-xs text-[#5C5854]">Te llegan al +{phone} desde el número de LYRA.</p>
          <button type="button" disabled={busy} onClick={() => void save(null)} className="shrink-0 text-xs font-medium text-[#B42318] disabled:opacity-50">
            Quitar
          </button>
        </div>
      ) : (
        <form
          className="mt-1.5 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save(draft);
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            inputMode="tel"
            placeholder="Tu WhatsApp con código de país, p. ej. 52 55 1234 5678"
            className="min-w-0 flex-1 rounded-lg border border-[#E7E2DA] bg-white px-3 py-1.5 text-base text-[#1E1E24] outline-none sm:text-xs focus:border-[#7C3AED]"
          />
          <button
            type="submit"
            disabled={busy || draft.replace(/\D/g, "").length < 10}
            className="shrink-0 rounded-lg bg-[#1E1E24] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            Activar
          </button>
        </form>
      )}
    </div>
  );
}

export function RoutinesPanel({ onClose }: { onClose: () => void }) {
  const [tasks, setTasks] = useState<VegaTaskView[] | null>(null);
  const [runs, setRuns] = useState<VegaRoutineRunView[]>([]);

  useEffect(() => {
    let alive = true;
    void vegaTasks().then((items) => {
      if (alive) setTasks(items);
    });
    void vegaRoutineRuns().then((items) => {
      if (!alive) return;
      setRuns(items);
      if (items.some((run) => !run.seen)) void markVegaRoutineRunsSeen();
    });
    return () => {
      alive = false;
    };
  }, []);

  async function toggle(task: VegaTaskView) {
    const paused = task.status === "active";
    const result = await toggleVegaTask(task.id, paused);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo actualizar. Intenta de nuevo.");
      return;
    }
    setTasks(
      (current) =>
        current?.map((item) =>
          item.id === task.id ? { ...item, status: paused ? "paused" : "active", runAt: result.runAt ?? item.runAt } : item,
        ) ?? null,
    );
  }

  async function remove(id: string) {
    const result = await deleteVegaTask(id);
    if (!result.ok) {
      toast.error("No se pudo borrar. Intenta de nuevo.");
      return;
    }
    setTasks((current) => current?.filter((task) => task.id !== id) ?? null);
  }

  return (
    <div className={sheetClass}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-[#1E1E24]">
          <CalendarClock className="size-4 text-[#7C3AED]" />
          Rutinas
        </p>
        <button type="button" onClick={onClose} className="rounded p-1 text-[#8A8680]" aria-label="Cerrar">
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-1 text-xs leading-5 text-[#8A8680]">
        Recordatorios a hora exacta y trabajos que Vega hace solo, una vez o con horario fijo. Te llegan a «Recordatorios de Vega», a tu
        correo si conectaste Gmail y a WhatsApp si lo activas. Los envíos a otras personas siempre esperan tu confirmación.
      </p>
      <WhatsappReminders />
      <NewRoutine onCreated={(task) => setTasks((current) => [...(current ?? []), task].sort((a, b) => a.runAt.localeCompare(b.runAt)))} />

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {tasks === null ? (
          <p className="text-sm text-[#8A8680]">Cargando…</p>
        ) : tasks.length === 0 ? (
          <p className="rounded-xl bg-[#FCFBF9] p-3 text-sm text-[#8A8680]">
            Aún no tienes rutinas. Pídele a Vega algo como «Recuérdame hoy a las 16:30 llamar a Mariana» o «De lunes a viernes a las 8:00
            revisa mi correo y hazme un resumen».
          </p>
        ) : (
          <ul className="space-y-1.5">
            {tasks.map((task) => (
              <li
                key={task.id}
                className={cn("flex items-start gap-2 rounded-xl border border-[#F0ECE6] px-3 py-2", task.status === "paused" && "opacity-60")}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#1E1E24]">{task.title}</p>
                  <p className="mt-0.5 text-xs text-[#8A8680]">
                    {task.kind === "task" ? "Tarea" : "Recordatorio"} · {task.label}
                  </p>
                  <p className="mt-0.5 text-xs text-[#8A8680]">
                    {task.status === "paused" ? "En pausa" : `Próxima: ${formatWhen(task.runAt, task.timezone)}`}
                  </p>
                  {task.lastResult ? <p className="mt-0.5 line-clamp-2 text-xs text-[#A8A29E]">{task.lastResult}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => void toggle(task)}
                  className="shrink-0 rounded p-1 text-[#A8A29E] hover:text-[#7C3AED]"
                  aria-label={task.status === "paused" ? "Reanudar" : "Pausar"}
                >
                  {task.status === "paused" ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(task.id)}
                  className="shrink-0 rounded p-1 text-[#A8A29E] hover:text-[#B42318]"
                  aria-label="Borrar rutina"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <RecentRuns runs={runs} />
      </div>
    </div>
  );
}

/** @deprecated nombre anterior del panel. */
export const TasksPanel = RoutinesPanel;
