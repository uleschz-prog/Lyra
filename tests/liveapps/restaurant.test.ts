import { describe, expect, it, vi } from "vitest";

import { bundleProject } from "@/lib/builder/bundle";
import { advanceEngine, initialState } from "@/lib/builder/engine";
import { liveManifest, scaffoldFiles } from "@/lib/builder/scaffold";
import { branchesFromBrief, isRestaurantBrief, restaurantFiles, restaurantPlan } from "@/lib/builder/templates/restaurant";
import { normalizeManifest } from "@/lib/liveapps/manifest";
import { findSecret } from "@/lib/vega/secret-filter";

const brief = "Sistema para el restaurante Las 3 Huastecas con 2 sucursales: meseros toman comandas en tablet, cocina las ve, caja cobra y se descuenta inventario.\nNombre: Las 3 Huastecas";

describe("plantilla de restaurante con datos en vivo", () => {
  it("reconoce el encargo y cuenta sucursales", () => {
    expect(isRestaurantBrief(brief)).toBe(true);
    expect(isRestaurantBrief("Taquería con comandas y cocina")).toBe(true);
    expect(isRestaurantBrief("CRM para despacho de abogados")).toBe(false);
    expect(isRestaurantBrief("Sitio para restaurante con menú y reservas por WhatsApp")).toBe(false);
    expect(branchesFromBrief(brief).map((branch) => branch.name)).toEqual(["Sucursal 1", "Sucursal 2"]);
    expect(branchesFromBrief("tres sucursales")).toHaveLength(3);
    expect(branchesFromBrief("un local")).toEqual([{ id: "principal", name: "Principal" }]);
  });

  it("el manifiesto es válido: roles, permisos, recetas y existencias por sucursal", () => {
    const plan = restaurantPlan({ brief, title: "" });
    expect(plan.title).toBe("Las 3 Huastecas");
    const manifest = normalizeManifest(liveManifest(plan))!;
    expect(manifest.roles.map((role) => role.key)).toEqual(["admin", "mesero", "cocina", "caja"]);
    const byKey = Object.fromEntries(manifest.collections.map((collection) => [collection.key, collection]));
    expect(byKey.platillos.write).toEqual(["admin"]);
    expect(byKey.comandas).toMatchObject({ scope: "branch", sync: "recent" });
    expect(byKey.movimientos.write).toEqual(["caja"]);
    expect(byKey.existencias.seed).toHaveLength(2 * 9);
    expect(byKey.existencias.seed?.[0]).toMatchObject({ id: "sucursal-1_tortilla", branchId: "sucursal-1" });
    // Cada insumo de cada receta existe.
    const insumos = new Set(byKey.insumos.seed?.map((row) => row.id));
    for (const platillo of byKey.platillos.seed ?? []) for (const line of platillo.receta as { insumo: string }[]) expect(insumos.has(line.insumo)).toBe(true);
  });

  it("compila, no trae nada con forma de secreto y entra con PIN", async () => {
    const plan = restaurantPlan({ brief, title: "Las 3 Huastecas" });
    const files = { ...scaffoldFiles(plan), ...restaurantFiles(plan) };
    const result = await bundleProject(files);
    expect(result.ok).toBe(true);
    expect(files["src/App.tsx"]).toContain("<LiveGate>");
    for (const [path, content] of Object.entries(files)) expect([path, findSecret(content)]).toEqual([path, null]);
  }, 30_000);

  it("el generador usa la plantilla sin llamar al modelo y llega a guardar", async () => {
    const model = vi.fn();
    let clock = 0;
    const { state } = await advanceEngine(initialState(), { brief, kind: "app", title: "", live: true }, { model, now: () => (clock += 10) }, 600_000);
    expect(model).not.toHaveBeenCalled();
    expect(state.step).toBe("save");
    expect(state.plan?.live?.branches).toHaveLength(2);
    expect(Object.keys(state.files)).toEqual(expect.arrayContaining(["lyra.app.json", "src/pages/Mesero.tsx", "src/pages/Cocina.tsx", "src/pages/Caja.tsx"]));
  }, 30_000);

  it("sin datos en vivo, un restaurante sigue por el generador normal", async () => {
    const model = vi.fn(async () => ({ ok: false as const, error: "sin modelo", usage: null }));
    await advanceEngine(initialState(), { brief, kind: "app", title: "", live: false }, { model, now: () => 0 }, 600_000);
    expect(model).toHaveBeenCalled();
  });
});
