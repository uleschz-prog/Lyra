import type { AuthProfile } from "@/lib/types";

export const telegramPlans = ["STARTED", "PRO", "FOUNDER", "CORPORATE"] as const;

export function canUseTelegram(user: Pick<AuthProfile, "role" | "package"> | null) {
  if (!user) return false;
  return user.role === "ADMIN" || (telegramPlans as readonly string[]).includes(user.package);
}

export const TIMEZONE_OFFSET_HOURS = -6;
export const QUIET_START = 21;
export const QUIET_END = 9;

export function maxAutoFollowups() {
  const value = Number(process.env.TELEGRAM_MAX_AUTO_FOLLOWUPS);
  return Number.isFinite(value) && value >= 0 ? Math.min(10, Math.floor(value)) : 3;
}

/** Plan de seguimientos en minutos. El de 5 minutos requiere un cron externo frecuente. */
export function followupPlan() {
  return process.env.TELEGRAM_FOLLOWUP_FAST === "1" ? [5, 24 * 60, 3 * 24 * 60] : [24 * 60, 3 * 24 * 60];
}

export const delayMinutes = { "1h": 60, "24h": 24 * 60, "3d": 3 * 24 * 60 } as const;

function localHour(date: Date) {
  return (date.getUTCHours() + 24 + TIMEZONE_OFFSET_HOURS) % 24;
}

/** Mueve la hora a la ventana permitida (9:00 a 21:00, Ciudad de México). */
export function withinSendingWindow(date: Date) {
  const hour = localHour(date);
  if (hour >= QUIET_END && hour < QUIET_START) return date;
  const next = new Date(date);
  next.setUTCMinutes(0, 0, 0);
  const hoursUntil = hour >= QUIET_START ? 24 - hour + QUIET_END : QUIET_END - hour;
  next.setUTCHours(next.getUTCHours() + hoursUntil);
  return next;
}

export type ProactiveCheck = {
  optedIn: boolean;
  isBlocked: boolean;
  automation: string;
  autoSent: number;
  connectionStatus: string;
  connectionAutomation: boolean;
  connectionFollowups: boolean;
  hasChatId: boolean;
};

/** Reglas para escribir sin que el contacto haya escrito primero en este momento. */
export function proactiveBlock(check: ProactiveCheck) {
  if (!check.hasChatId) return "El contacto nunca inició el bot.";
  if (!check.optedIn) return "El contacto pidió no recibir mensajes.";
  if (check.isBlocked) return "El contacto bloqueó al bot.";
  if (check.automation !== "active") return "La automatización de este chat está pausada.";
  if (check.connectionStatus !== "active") return "El bot no está activo.";
  if (!check.connectionAutomation || !check.connectionFollowups) return "El socio desactivó los seguimientos.";
  if (check.autoSent >= maxAutoFollowups()) return "Se alcanzó el límite de seguimientos sin respuesta.";
  return null;
}
