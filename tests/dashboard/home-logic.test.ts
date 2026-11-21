import { describe, expect, it } from "vitest";

import {
  buildDailyTrend,
  greetingFor,
  groupActivityByDay,
  todayLabel,
  type HomeActivity,
} from "@/lib/dashboard/home-logic";

const tz = "America/Mexico_City";
// 21 nov 2026, 16:00 en Ciudad de México (UTC-6).
const now = new Date("2026-11-21T22:00:00Z");

function item(partial: Partial<HomeActivity> & Pick<HomeActivity, "id" | "title">): HomeActivity {
  return {
    kind: "spend",
    amount: null,
    credits: -1,
    at: "2026-11-21T20:00:00Z",
    ...partial,
  };
}

describe("greetingFor", () => {
  it("cambia según la hora en Ciudad de México", () => {
    expect(greetingFor("Ule Bolaños", new Date("2026-11-21T14:00:00Z"), tz)).toBe("Buenos días, Ule");
    expect(greetingFor("Ule Bolaños", new Date("2026-11-21T19:00:00Z"), tz)).toBe("Buenas tardes, Ule");
    expect(greetingFor("Ule Bolaños", new Date("2026-11-22T03:00:00Z"), tz)).toBe("Buenas noches, Ule");
  });
});

describe("todayLabel", () => {
  it("escribe la fecha en español", () => {
    expect(todayLabel(now, tz)).toMatch(/sábado/);
    expect(todayLabel(now, tz)).toMatch(/21/);
    expect(todayLabel(now, tz)).toMatch(/noviembre/);
  });
});

describe("groupActivityByDay", () => {
  it("agrupa los mensajes de Vega del mismo día y suma créditos", () => {
    const days = groupActivityByDay(
      [
        item({ id: "1", title: "Vega · mensaje", at: "2026-11-21T21:00:00Z", credits: -1 }),
        item({ id: "2", title: "Vega · mensaje", at: "2026-11-21T20:10:00Z", credits: -1 }),
        item({ id: "3", title: "Vega · mensaje", at: "2026-11-21T18:00:00Z", credits: -1 }),
        item({ id: "4", title: "Vega · mensaje", at: "2026-11-21T17:00:00Z", credits: -1 }),
        item({ id: "5", kind: "referral", title: "jorgeluis27 se unió a tu red", credits: null, at: "2026-11-16T18:00:00Z" }),
      ],
      now,
      tz,
    );

    expect(days[0]?.label).toBe("Hoy");
    expect(days[0]?.items[0]).toMatchObject({ title: "Vega · 4 mensajes", count: 4, credits: -4, kind: "spend" });
    expect(days[1]?.items[0]).toMatchObject({ title: "jorgeluis27 se unió a tu red", count: 1 });
  });

  it("no junta a socios distintos que se unieron el mismo día", () => {
    const days = groupActivityByDay(
      [
        item({ id: "a", kind: "referral", title: "Ana se unió a tu red", credits: null, at: "2026-11-21T20:00:00Z" }),
        item({ id: "b", kind: "referral", title: "Luis se unió a tu red", credits: null, at: "2026-11-21T19:00:00Z" }),
      ],
      now,
      tz,
    );
    expect(days[0]?.items).toHaveLength(2);
  });

  it("marca el día anterior como Ayer", () => {
    const days = groupActivityByDay(
      [item({ id: "1", title: "Vega · herramienta", credits: -2, at: "2026-11-20T18:00:00Z" })],
      now,
      tz,
    );
    expect(days[0]?.label).toBe("Ayer");
    expect(days[0]?.items[0]?.title).toBe("Vega · herramienta");
  });
});

describe("buildDailyTrend", () => {
  it("devuelve vacío si no hay movimiento", () => {
    expect(buildDailyTrend([], "commissions", now)).toEqual([]);
    expect(buildDailyTrend([{ kind: "CREDIT_SPEND", amount: 0, creditDelta: 0, createdAt: now }], "credits", now)).toEqual([]);
  });

  it("arma 14 días y solo incluye comisiones reales", () => {
    const points = buildDailyTrend(
      [
        { kind: "COMMISSION", amount: 12.5, creditDelta: 0, createdAt: "2026-11-21T18:00:00Z" },
        { kind: "COMMISSION", amount: 7.5, creditDelta: 0, createdAt: "2026-11-21T12:00:00Z" },
        { kind: "CREDIT_SPEND", amount: 0, creditDelta: -1, createdAt: "2026-11-20T18:00:00Z" },
      ],
      "commissions",
      now,
    );
    expect(points).toHaveLength(14);
    expect(points.at(-1)).toMatchObject({ day: "2026-11-21", value: 20 });
    expect(points.at(-2)?.value).toBe(0);
  });
});
