export const DAILY_HOUR = 7;

export type TaskRepeat = "once" | "daily" | "weekly" | "monthly";
export type TaskKind = "reminder" | "task";

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
};

export const repeatLabels: Record<TaskRepeat, string> = {
  once: "Una vez",
  daily: "Cada día",
  weekly: "Cada semana",
  monthly: "Cada mes",
};
