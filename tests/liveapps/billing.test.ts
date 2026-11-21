import { describe, expect, it, vi } from "vitest";

import { addOneMonth, chargeLiveAppFees } from "@/lib/liveapps/billing";
import { LIVE_APP_BUILD_PRICE, LIVE_APP_MONTHLY_FEE, LIVE_APPS_ENABLED, liveAppsAvailable } from "@/lib/liveapps/config";
import type { LiveDb } from "@/lib/liveapps/core";
import { toCsv } from "@/lib/liveapps/core";
import { normalizeManifest } from "@/lib/liveapps/manifest";

import { testManifest } from "./fixtures";

describe("decisiones de negocio (constantes)", () => {
  it("valores por defecto acordados", () => {
    expect(LIVE_APP_BUILD_PRICE).toBe(20);
    expect(LIVE_APP_MONTHLY_FEE).toBe(0);
    expect(liveAppsAvailable({ role: "ADMIN" })).toBe(true);
    expect(liveAppsAvailable({ role: "USER" })).toBe(LIVE_APPS_ENABLED);
  });
});

describe("cuota mensual", () => {
  it("con cuota 0 no toca la base ni cobra", async () => {
    const charge = vi.fn();
    const db = new Proxy({}, { get: () => { throw new Error("no debe usar la base"); } }) as unknown as LiveDb;
    expect(await chargeLiveAppFees({ db, charge })).toEqual({ skipped: true, charged: 0, paused: 0 });
    expect(charge).not.toHaveBeenCalled();
  });

  it("si se enciende cobra lo vencido y pausa a quien no tiene créditos", async () => {
    const now = new Date("2026-12-01T12:00:00Z");
    const updates: { id: string; data: Record<string, unknown> }[] = [];
    const db = {
      appSpace: {
        findMany: vi.fn(async () => [
          { id: "a", userId: "u1", paidUntil: null, project: { title: "Huastecas" } },
          { id: "b", userId: "u2", paidUntil: new Date("2026-11-30T00:00:00Z"), project: { title: "Café" } },
        ]),
        update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => updates.push({ id: args.where.id, data: args.data })),
      },
      appSession: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    } as unknown as LiveDb;
    const charge = vi.fn(async (userId: string) => (userId === "u1" ? { ok: true as const, chargeId: "c1" } : { ok: false as const, error: "Sin créditos" }));
    const result = await chargeLiveAppFees({ db, now, fee: 50, charge });
    expect(result).toEqual({ skipped: false, charged: 1, paused: 1 });
    expect(charge).toHaveBeenCalledWith("u1", 50, expect.stringContaining("Huastecas"), "liveapp:a:2026-12");
    expect(updates).toEqual([
      { id: "a", data: { paidUntil: addOneMonth(now) } },
      { id: "b", data: { status: "paused" } },
    ]);
  });
});

describe("exportar CSV", () => {
  it("usa etiquetas, nombre de sucursal y neutraliza fórmulas", () => {
    const manifest = normalizeManifest(testManifest)!;
    const comandas = manifest.collections.find((collection) => collection.key === "comandas")!;
    const csv = toCsv({
      collection: comandas,
      branches: manifest.branches,
      rows: [{ id: "c1", c: "comandas", b: "norte", v: 1, s: 3, d: { mesa: "=HYPERLINK(\"x\")", estado: "Lista", total: 120, items: [{ nombre: "Cecina", cantidad: 1 }] }, x: false, ca: "2026-11-21T10:00:00.000Z", ua: "2026-11-21T10:05:00.000Z" }],
    });
    const [header, line] = csv.replace(/^\uFEFF/, "").trim().split("\r\n");
    expect(header).toBe("id,sucursal,Mesa,Estado,Total,Platillos,creado,actualizado");
    expect(line).toContain(",Norte,");
    expect(line).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
