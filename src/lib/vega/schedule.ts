// Horarios de rutinas: cron de 5 campos evaluado en la zona horaria del socio.
// Puro y sin dependencias de servidor: se usa también desde el panel (cliente).

export const DEFAULT_TIMEZONE = "America/Mexico_City";
export const MIN_INTERVAL_MINUTES = 15;

export type RoutineRepeat = "once" | "daily" | "weekdays" | "weekly" | "monthly" | "custom";

type Parts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let found = formatters.get(timeZone);
  if (!found) {
    found = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatters.set(timeZone, found);
  }
  return found;
}

export function isValidTimezone(timeZone: string) {
  if (!timeZone || timeZone.length > 64) return false;
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(date: Date, timeZone: string): Parts {
  const parts = formatter(timeZone).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    weekday: weekdays[get("weekday")] ?? 0,
  };
}

function offsetMinutes(timeZone: string, at: number) {
  const p = zonedParts(new Date(at), timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(at / 60_000) * 60_000) / 60_000);
}

/** Hora local de pared (en `timeZone`) → instante UTC. */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = offsetMinutes(timeZone, guess);
  let ts = guess - first * 60_000;
  const second = offsetMinutes(timeZone, ts);
  if (second !== first) ts = guess - second * 60_000;
  return new Date(ts);
}

export function parseDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day };
}

export function parseTime(time: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

// ── Cron ─────────────────────────────────────────────────────────────

export type Cron = {
  minutes: number[];
  hours: number[];
  days: Set<number>;
  months: Set<number>;
  weekdays: Set<number>;
  anyDay: boolean;
  anyWeekday: boolean;
};

function field(raw: string, min: number, max: number): number[] | null {
  const values = new Set<number>();
  for (const piece of raw.split(",")) {
    const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(piece);
    if (!match) return null;
    const step = match[2] ? Number(match[2]) : 1;
    if (step < 1) return null;
    let from = min;
    let to = max;
    if (match[1] !== "*") {
      const [a, b] = match[1].split("-").map(Number);
      from = a;
      to = b ?? (match[2] ? max : a);
    }
    if (from < min || to > max || from > to) return null;
    for (let value = from; value <= to; value += step) values.add(value);
  }
  return [...values].sort((a, b) => a - b);
}

export function parseCron(expression: string): Cron | null {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5 || expression.length > 100) return null;
  const minutes = field(fields[0], 0, 59);
  const hours = field(fields[1], 0, 23);
  const days = field(fields[2], 1, 31);
  const months = field(fields[3], 1, 12);
  const weekdayList = field(fields[4], 0, 7);
  if (!minutes || !hours || !days || !months || !weekdayList) return null;
  return {
    minutes,
    hours,
    days: new Set(days),
    months: new Set(months),
    weekdays: new Set(weekdayList.map((day) => day % 7)),
    anyDay: fields[2] === "*",
    anyWeekday: fields[4] === "*",
  };
}

function dayMatches(cron: Cron, day: number, weekday: number) {
  if (cron.anyDay && cron.anyWeekday) return true;
  if (cron.anyDay) return cron.weekdays.has(weekday);
  if (cron.anyWeekday) return cron.days.has(day);
  return cron.days.has(day) || cron.weekdays.has(weekday); // semántica clásica de cron
}

/** Siguiente ocurrencia estrictamente posterior a `after`, o null si no hay en ~13 meses. */
export function nextCronRun(expression: string | Cron, timeZone: string, after: Date): Date | null {
  const cron = typeof expression === "string" ? parseCron(expression) : expression;
  if (!cron) return null;
  const start = zonedParts(after, timeZone);
  for (let offset = 0; offset <= 400; offset += 1) {
    const calendar = new Date(Date.UTC(start.year, start.month - 1, start.day + offset));
    const year = calendar.getUTCFullYear();
    const month = calendar.getUTCMonth() + 1;
    const day = calendar.getUTCDate();
    if (!cron.months.has(month) || !dayMatches(cron, day, calendar.getUTCDay())) continue;
    for (const hour of cron.hours) {
      if (offset === 0 && hour < start.hour) continue;
      for (const minute of cron.minutes) {
        const at = zonedToUtc(year, month, day, hour, minute, timeZone);
        if (at.getTime() > after.getTime()) return at;
      }
    }
  }
  return null;
}

/** Verifica que el cron dispare y que nunca lo haga con menos de `minMinutes` de separación. */
export function checkCronInterval(expression: string, timeZone: string, now: Date, minMinutes = MIN_INTERVAL_MINUTES) {
  const cron = parseCron(expression);
  if (!cron) return { ok: false as const, error: "El horario personalizado no es un cron válido de 5 campos (min hora día mes díaSemana)." };
  // Con minutos/horas múltiples, la separación mínima aparece dentro de un mismo día; con 60 muestras basta.
  let previous = nextCronRun(cron, timeZone, now);
  if (!previous) return { ok: false as const, error: "Ese horario nunca se cumple en el próximo año." };
  for (let index = 0; index < 60; index += 1) {
    const next = nextCronRun(cron, timeZone, previous);
    if (!next) break;
    if (next.getTime() - previous.getTime() < minMinutes * 60_000) {
      return { ok: false as const, error: `Las rutinas no pueden repetirse más de una vez cada ${minMinutes} minutos.` };
    }
    previous = next;
  }
  return { ok: true as const };
}

export type ScheduleInput = {
  repeat: RoutineRepeat;
  date: string;
  time: string;
  timezone: string;
  cron?: string;
};

export type BuiltSchedule =
  | { ok: true; schedule: string | null; runAt: Date; timezone: string }
  | { ok: false; error: string };

export function buildSchedule(input: ScheduleInput, now: Date): BuiltSchedule {
  const timezone = input.timezone || DEFAULT_TIMEZONE;
  if (!isValidTimezone(timezone)) return { ok: false, error: "Zona horaria no válida (usa un nombre IANA como America/Mexico_City)." };
  const date = parseDate(input.date);
  if (!date) return { ok: false, error: "La fecha debe ser YYYY-MM-DD." };
  const time = parseTime(input.time);
  if (!time) return { ok: false, error: "La hora debe ser HH:MM en formato de 24 horas." };
  const start = zonedToUtc(date.year, date.month, date.day, time.hour, time.minute, timezone);

  if (input.repeat === "once") {
    if (start.getTime() <= now.getTime()) return { ok: false, error: "Esa fecha y hora ya pasaron." };
    return { ok: true, schedule: null, runAt: start, timezone };
  }

  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  const schedule =
    input.repeat === "daily"
      ? `${time.minute} ${time.hour} * * *`
      : input.repeat === "weekdays"
        ? `${time.minute} ${time.hour} * * 1-5`
        : input.repeat === "weekly"
          ? `${time.minute} ${time.hour} * * ${weekday}`
          : input.repeat === "monthly"
            ? `${time.minute} ${time.hour} ${date.day} * *`
            : (input.cron ?? "").trim().replace(/\s+/g, " ");

  const checked = checkCronInterval(schedule, timezone, now);
  if (!checked.ok) return checked;
  const from = new Date(Math.max(now.getTime(), start.getTime() - 60_000));
  const runAt = nextCronRun(schedule, timezone, from);
  if (!runAt) return { ok: false, error: "Ese horario nunca se cumple en el próximo año." };
  return { ok: true, schedule, runAt, timezone };
}

const legacyStepDays: Record<string, number> = { daily: 1, weekly: 7 };

/** Próxima ejecución después de `after`. Las rutinas viejas (sin cron) avanzan por intervalos desde su runAt. */
export function nextRoutineRun(
  task: { schedule: string | null; timezone: string; repeat: string; runAt: Date },
  after: Date,
): Date | null {
  if (task.schedule) return nextCronRun(task.schedule, task.timezone || DEFAULT_TIMEZONE, after);
  if (task.repeat === "once") return null;
  const next = new Date(task.runAt);
  let guard = 0;
  while (next.getTime() <= after.getTime() && guard < 2000) {
    if (task.repeat === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
    else next.setUTCDate(next.getUTCDate() + (legacyStepDays[task.repeat] ?? 1));
    guard += 1;
  }
  return next;
}

// ── Etiquetas ────────────────────────────────────────────────────────

const dayNames = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function describeSchedule(task: { schedule: string | null; timezone: string; repeat: string; runAt: Date | string }) {
  const timezone = task.timezone || DEFAULT_TIMEZONE;
  const runAt = new Date(task.runAt);
  const local = zonedParts(runAt, timezone);
  const clock = `${pad(local.hour)}:${pad(local.minute)}`;
  const zone = timezone === DEFAULT_TIMEZONE ? "" : ` (${timezone})`;
  if (!task.schedule) {
    if (task.repeat === "once") {
      const day = runAt.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", timeZone: timezone });
      return `Una vez · ${day}, ${clock}${zone}`;
    }
    const legacy: Record<string, string> = { daily: "Cada día", weekly: `Cada ${dayNames[local.weekday]}`, monthly: `Cada mes el día ${local.day}` };
    return `${legacy[task.repeat] ?? "Periódica"} · ${clock}${zone}`;
  }
  const [minute, hour, day, , weekday] = task.schedule.split(" ");
  const fixedClock = /^\d+$/.test(minute) && /^\d+$/.test(hour) ? `${pad(Number(hour))}:${pad(Number(minute))}` : null;
  if (fixedClock && task.repeat === "daily") return `Cada día · ${fixedClock}${zone}`;
  if (fixedClock && task.repeat === "weekdays") return `Lunes a viernes · ${fixedClock}${zone}`;
  if (fixedClock && task.repeat === "weekly" && /^\d$/.test(weekday)) return `Cada ${dayNames[Number(weekday) % 7]} · ${fixedClock}${zone}`;
  if (fixedClock && task.repeat === "monthly" && /^\d+$/.test(day)) return `Cada mes el día ${day} · ${fixedClock}${zone}`;
  return `Personalizada (${task.schedule})${zone}`;
}
