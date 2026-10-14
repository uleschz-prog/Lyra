"use client";

import { CalendarClock, MessageCircle, Pause, Play, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { deleteVegaTask, saveVegaWhatsapp, toggleVegaTask, vegaTasks, vegaWhatsapp } from "@/app/dashboard/super-agent/actions";
import { sheetClass } from "@/components/vega/sheet";
import { DAILY_HOUR, repeatLabels, type VegaTaskView } from "@/lib/vega/tasks-shared";
import { cn } from "@/lib/utils";

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "America/Mexico_City",
  });
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

export function TasksPanel({ onClose }: { onClose: () => void }) {
  const [tasks, setTasks] = useState<VegaTaskView[] | null>(null);

  useEffect(() => {
    let alive = true;
    void vegaTasks().then((items) => {
      if (alive) setTasks(items);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function toggle(task: VegaTaskView) {
    const paused = task.status === "active";
    const result = await toggleVegaTask(task.id, paused);
    if (!result.ok) {
      toast.error("No se pudo actualizar. Intenta de nuevo.");
      return;
    }
    setTasks((current) => current?.map((item) => (item.id === task.id ? { ...item, status: paused ? "paused" : "active" } : item)) ?? null);
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
          Tareas y recordatorios
        </p>
        <button type="button" onClick={onClose} className="rounded p-1 text-[#8A8680]" aria-label="Cerrar">
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-1 text-xs leading-5 text-[#8A8680]">
        Vega los entrega a las {DAILY_HOUR}:00 am del día programado, en la conversación «Recordatorios de Vega» y en tu correo si
        conectaste Gmail.
      </p>
      <WhatsappReminders />

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {tasks === null ? (
          <p className="text-sm text-[#8A8680]">Cargando…</p>
        ) : tasks.length === 0 ? (
          <p className="rounded-xl bg-[#FCFBF9] p-3 text-sm text-[#8A8680]">
            Aún no tienes tareas. Pídele a Vega algo como «Recuérdame el lunes llamar a Mariana» o «Cada viernes prepárame un resumen
            de noticias de IA».
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
                    {task.kind === "task" ? "Tarea" : "Recordatorio"} · {repeatLabels[task.repeat]} ·{" "}
                    {task.status === "paused" ? "En pausa" : `Próxima: ${formatDay(task.runAt)}`}
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
                  aria-label="Borrar tarea"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
