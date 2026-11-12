import type { RoutineRepeat } from "@/lib/vega/schedule";

export type TaskRepeat = RoutineRepeat;
/** x_monitor = monitor de X (Fase 8): consulta X sin modelo y avisa solo si hay un pico negativo. */
export type TaskKind = "reminder" | "task" | "x_monitor";

/** Hora por defecto cuando el socio no dice una (hora local de su zona). */
export const DEFAULT_TIME = "09:00";

export type VegaTaskView = {
  id: string;
  title: string;
  instruction: string;
  kind: TaskKind;
  repeat: TaskRepeat;
  useWeb: boolean;
  runAt: string;
  status: "active" | "paused" | "done";
  lastRunAt: string | null;
  lastResult: string | null;
  schedule: string | null;
  timezone: string;
  /** Texto listo para mostrar, p. ej. «Lunes a viernes · 08:30». */
  label: string;
  runCount: number;
  failCount: number;
};

export type RoutineRunStatus = "queued" | "running" | "done" | "failed" | "skipped";

export type VegaRoutineRunView = {
  id: string;
  taskId: string;
  title: string;
  scheduledFor: string;
  status: RoutineRunStatus;
  result: string | null;
  pendingActions: number;
  conversationId: string | null;
  seen: boolean;
};

export const repeatLabels: Record<TaskRepeat, string> = {
  once: "Una vez",
  daily: "Cada día",
  weekdays: "Lunes a viernes",
  weekly: "Cada semana",
  monthly: "Cada mes",
  custom: "Personalizada",
};

export const runStatusLabels: Record<RoutineRunStatus, string> = {
  queued: "En cola",
  running: "Ejecutándose",
  done: "Lista",
  failed: "Falló",
  skipped: "Omitida",
};
