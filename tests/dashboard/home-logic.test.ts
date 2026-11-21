import { describe, expect, it } from "vitest";

import {
  accumulateTrend,
  buildDailyTrend,
  buildHomeSteps,
  greetingFor,
  groupActivityByDay,
  hasTrend,
  publishStatusLabel,
  sanitizeVegaDraft,
  todayLabel,
  vegaHref,
  type HomeActivity,
} from "@/lib/dashboard/home-logic";
import { monotoneCurve } from "@/lib/dashboard/sparkline-path";

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

describe("accumulateTrend", () => {
  it("suma en orden y no inventa días", () => {
    expect(
      accumulateTrend([
        { day: "2026-11-19", value: 0 },
        { day: "2026-11-20", value: -2 },
        { day: "2026-11-21", value: -1 },
      ]),
    ).toEqual([
      { day: "2026-11-19", value: 0 },
      { day: "2026-11-20", value: -2 },
      { day: "2026-11-21", value: -3 },
    ]);
  });

  it("hasTrend es falso si no hay movimiento", () => {
    expect(hasTrend([])).toBe(false);
    expect(hasTrend([{ day: "2026-11-21", value: 0 }])).toBe(false);
    expect(hasTrend([
      { day: "2026-11-20", value: 0 },
      { day: "2026-11-21", value: -1 },
    ])).toBe(true);
  });
});

describe("monotoneCurve", () => {
  it("emite una curva cúbica a lo ancho", () => {
    const d = monotoneCurve([
      { x: 0, y: 10 },
      { x: 50, y: 10 },
      { x: 100, y: 30 },
    ]);
    expect(d.startsWith("M 0.00 10.00")).toBe(true);
    expect(d).toContain(" C ");
    expect(d.endsWith("100.00 30.00")).toBe(true);
  });
});

describe("sanitizeVegaDraft y vegaHref", () => {
  it("recorta y limpia el borrador", () => {
    expect(sanitizeVegaDraft("  Hola   Vega  ")).toBe("Hola Vega");
    expect(sanitizeVegaDraft(123)).toBe("");
    expect(sanitizeVegaDraft("x".repeat(3000)).length).toBe(2000);
  });

  it("arma la URL de Vega sin inventar parámetros", () => {
    expect(vegaHref()).toBe("/dashboard/super-agent");
    expect(vegaHref({ mensaje: "Crea un sitio" })).toBe("/dashboard/super-agent?mensaje=Crea+un+sitio");
    expect(vegaHref({ agente: "abc" })).toBe("/dashboard/super-agent");
    expect(vegaHref({ agente: "clk1234567890" })).toContain("agente=clk1234567890");
  });
});

describe("buildHomeSteps", () => {
  const base = {
    canUseVega: true,
    talkedToVega: true,
    projectCount: 1,
    publishedCount: 0,
    customAgentCount: 0,
    connectedApps: 0,
    showConnections: false,
    directs: 7,
  };

  it("pide publicar si ya hay proyecto y no muestra conexiones si no hay Composio", () => {
    const steps = buildHomeSteps(base);
    expect(steps.find((step) => step.id === "publish")?.done).toBe(false);
    expect(steps.find((step) => step.id === "connect")).toBeUndefined();
    expect(steps.find((step) => step.id === "invite")?.done).toBe(true);
    expect(steps.find((step) => step.id === "agent")?.done).toBe(false);
  });

  it("sugiere activar la membresía si no puede usar Vega", () => {
    const steps = buildHomeSteps({ ...base, canUseVega: false, talkedToVega: false });
    expect(steps[0]).toMatchObject({ id: "plan", href: "/dashboard/upgrade", done: false });
    expect(steps.find((step) => step.id === "vega")).toBeUndefined();
  });
});

describe("publishStatusLabel", () => {
  it("nombra estados reales y no inventa publicados", () => {
    expect(publishStatusLabel("published")).toEqual({ label: "Publicado", tone: "live" });
    expect(publishStatusLabel(null)).toEqual({ label: "Sin publicar", tone: "draft" });
  });
});
