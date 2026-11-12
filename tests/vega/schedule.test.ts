import { describe, expect, it } from "vitest";

import {
  buildSchedule,
  checkCronInterval,
  describeSchedule,
  isValidTimezone,
  nextCronRun,
  nextRoutineRun,
  parseCron,
  zonedToUtc,
} from "@/lib/vega/schedule";

const MX = "America/Mexico_City";
// Jueves 12 nov 2026, 10:00 en Ciudad de México (UTC-6).
const now = new Date("2026-11-12T16:00:00Z");

describe("zonas horarias", () => {
  it("convierte hora local a UTC", () => {
    expect(zonedToUtc(2026, 11, 12, 16, 30, MX).toISOString()).toBe("2026-11-12T22:30:00.000Z");
    expect(zonedToUtc(2026, 11, 12, 9, 0, "Europe/Madrid").toISOString()).toBe("2026-11-12T08:00:00.000Z");
  });

  it("respeta el horario de verano de otras zonas", () => {
    // Nueva York: julio = UTC-4, diciembre = UTC-5.
    expect(zonedToUtc(2026, 7, 1, 9, 0, "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedToUtc(2026, 12, 1, 9, 0, "America/New_York").toISOString()).toBe("2026-12-01T14:00:00.000Z");
  });

  it("valida nombres IANA", () => {
    expect(isValidTimezone(MX)).toBe(true);
    expect(isValidTimezone("Marte/Olympus")).toBe(false);
  });
});

describe("cron", () => {
  it("rechaza expresiones inválidas", () => {
    expect(parseCron("* * * *")).toBeNull();
    expect(parseCron("60 * * * *")).toBeNull();
    expect(parseCron("0 25 * * *")).toBeNull();
    expect(parseCron("0 9 * * 1-5")).not.toBeNull();
  });

  it("calcula la siguiente ocurrencia en la zona del socio", () => {
    expect(nextCronRun("30 8 * * 1-5", MX, now)?.toISOString()).toBe("2026-11-13T14:30:00.000Z"); // vie 8:30
    expect(nextCronRun("0 11 * * *", MX, now)?.toISOString()).toBe("2026-11-12T17:00:00.000Z"); // hoy 11:00
    expect(nextCronRun("0 9 * * 1", MX, now)?.toISOString()).toBe("2026-11-16T15:00:00.000Z"); // lunes
    expect(nextCronRun("0 7 1 * *", MX, now)?.toISOString()).toBe("2026-12-01T13:00:00.000Z");
  });

  it("es estrictamente posterior a la hora dada", () => {
    const at = new Date("2026-11-12T17:00:00Z");
    expect(nextCronRun("0 11 * * *", MX, at)?.toISOString()).toBe("2026-11-13T17:00:00.000Z");
  });

  it("exige al menos 15 minutos entre ejecuciones", () => {
    expect(checkCronInterval("*/5 * * * *", MX, now).ok).toBe(false);
    expect(checkCronInterval("0,10 9 * * *", MX, now).ok).toBe(false);
    expect(checkCronInterval("*/15 9-10 * * *", MX, now).ok).toBe(true);
    expect(checkCronInterval("0 9,17 * * 1-5", MX, now).ok).toBe(true);
  });
});

describe("buildSchedule", () => {
  it("recordatorio único a hora exacta", () => {
    const built = buildSchedule({ repeat: "once", date: "2026-11-12", time: "16:30", timezone: MX }, now);
    expect(built).toMatchObject({ ok: true, schedule: null });
    if (built.ok) expect(built.runAt.toISOString()).toBe("2026-11-12T22:30:00.000Z");
  });

  it("rechaza fechas pasadas y horas mal escritas", () => {
    expect(buildSchedule({ repeat: "once", date: "2026-11-12", time: "09:00", timezone: MX }, now).ok).toBe(false);
    expect(buildSchedule({ repeat: "once", date: "2026-11-12", time: "25:00", timezone: MX }, now).ok).toBe(false);
    expect(buildSchedule({ repeat: "once", date: "2026-02-30", time: "09:00", timezone: MX }, now).ok).toBe(false);
  });

  it("traduce las repeticiones a cron", () => {
    const weekdays = buildSchedule({ repeat: "weekdays", date: "2026-11-12", time: "08:30", timezone: MX }, now);
    expect(weekdays).toMatchObject({ ok: true, schedule: "30 8 * * 1-5" });
    if (weekdays.ok) expect(weekdays.runAt.toISOString()).toBe("2026-11-13T14:30:00.000Z");

    const weekly = buildSchedule({ repeat: "weekly", date: "2026-11-16", time: "09:00", timezone: MX }, now);
    expect(weekly).toMatchObject({ ok: true, schedule: "0 9 * * 1" });

    const daily = buildSchedule({ repeat: "daily", date: "2026-11-20", time: "07:00", timezone: MX }, now);
    if (daily.ok) expect(daily.runAt.toISOString()).toBe("2026-11-20T13:00:00.000Z"); // empieza en la fecha pedida
  });

  it("valida el cron personalizado", () => {
    expect(buildSchedule({ repeat: "custom", date: "2026-11-12", time: "09:00", timezone: MX, cron: "* * * * *" }, now).ok).toBe(false);
    expect(buildSchedule({ repeat: "custom", date: "2026-11-12", time: "09:00", timezone: MX, cron: "0 9,17 * * 1-5" }, now)).toMatchObject({
      ok: true,
      schedule: "0 9,17 * * 1-5",
    });
  });
});

describe("nextRoutineRun", () => {
  it("salta lo atrasado: una sola ejecución aunque se hayan perdido varias", () => {
    const task = { schedule: "0 9 * * *", timezone: MX, repeat: "daily", runAt: new Date("2026-11-08T15:00:00Z") };
    expect(nextRoutineRun(task, now)?.toISOString()).toBe("2026-11-13T15:00:00.000Z");
  });

  it("mantiene las rutinas viejas sin cron", () => {
    const legacy = { schedule: null, timezone: MX, repeat: "weekly", runAt: new Date("2026-11-05T13:00:00Z") };
    expect(nextRoutineRun(legacy, now)?.toISOString()).toBe("2026-11-19T13:00:00.000Z");
    expect(nextRoutineRun({ ...legacy, repeat: "once" }, now)).toBeNull();
  });

  it("describe el horario en español", () => {
    expect(describeSchedule({ schedule: "30 8 * * 1-5", timezone: MX, repeat: "weekdays", runAt: now })).toBe("Lunes a viernes · 08:30");
    expect(describeSchedule({ schedule: "0 9 * * 1", timezone: MX, repeat: "weekly", runAt: now })).toBe("Cada lunes · 09:00");
    expect(describeSchedule({ schedule: "0 9,17 * * 1-5", timezone: MX, repeat: "custom", runAt: now })).toBe("Personalizada (0 9,17 * * 1-5)");
  });
});
