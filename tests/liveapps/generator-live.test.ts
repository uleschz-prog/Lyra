import { describe, expect, it } from "vitest";

import { fileSystemPrompt } from "@/lib/builder/generate";
import { composeSkeleton, normalizeLive, normalizePlan, planSystemPrompt } from "@/lib/builder/plan";
import { liveManifest } from "@/lib/builder/scaffold";
import { LIVE_APP_BUILD_PRICE } from "@/lib/liveapps/config";
import { normalizeManifest } from "@/lib/liveapps/manifest";
import { liveAppsPrompt, vegaSystemPrompt } from "@/lib/vega/prompt";
import { vegaTools } from "@/lib/vega/tools";

const brief = "Sistema para restaurante con 2 sucursales: meseros toman comandas, cocina las prepara y se descuenta inventario.";

const raw = {
  title: "Las 3 Huastecas",
  live: {
    roles: [{ key: "admin", label: "Jefe" }, { key: "Mesero", label: "Mesero" }, { key: "cocina", label: "Cocina" }, { key: "x", label: "corto" }],
    branches: [{ id: "Centro Histórico", name: "Centro Histórico" }, { name: "Plaza Norte" }, { name: "" }],
  },
  entities: [
    { key: "platillos", label: "Platillos", singular: "Platillo", scope: "shared", fields: [{ key: "nombre", type: "text" }, { key: "precio", type: "money" }], seed: [{ id: "enchiladas", nombre: "Enchiladas", precio: 120 }] },
    {
      key: "comandas",
      label: "Comandas",
      singular: "Comanda",
      scope: "branch",
      sync: "recent",
      write: ["mesero", "cocina", "intruso"],
      fields: [
        { key: "mesa", type: "text" },
        { key: "platillo", type: "ref", ref: "platillos" },
        { key: "fantasma", type: "ref", ref: "noexiste" },
        { key: "items", type: "items", fields: [{ key: "platillo", type: "ref", ref: "platillos" }, { key: "cantidad", type: "number" }, { key: "anidado", type: "items", fields: [{ key: "a", type: "text" }] }] },
      ],
      seed: [{ id: "c-1", branchId: "plaza-norte", mesa: "3", platillo: "enchiladas", items: [{ platillo: "enchiladas", cantidad: 2, otro: "x" }] }],
    },
  ],
};

function plan(live: boolean) {
  return normalizePlan(raw, { brief, kind: "app", composition: composeSkeleton(brief, "app"), fallbackTitle: "R", live });
}

describe("generador: plan con datos en vivo", () => {
  it("roles y sucursales limpios, siempre con una sucursal", () => {
    expect(normalizeLive(raw.live)).toEqual({
      roles: [{ key: "mesero", label: "Mesero" }, { key: "cocina", label: "Cocina" }],
      branches: [{ id: "centro-historico", name: "Centro Histórico" }, { id: "plaza-norte", name: "Plaza Norte" }],
    });
    expect(normalizeLive(null).branches).toEqual([{ id: "principal", name: "Principal" }]);
  });

  it("entidades con alcance, sincronización, permisos, referencias y renglones", () => {
    const result = plan(true);
    const comandas = result.entities.find((entity) => entity.key === "comandas")!;
    expect(comandas).toMatchObject({ scope: "branch", sync: "recent", write: ["mesero", "cocina"] });
    expect(comandas.fields.map((field) => field.key)).toEqual(["mesa", "platillo", "items"]);
    expect(comandas.fields[2].fields?.map((field) => field.key)).toEqual(["platillo", "cantidad"]);
    expect(comandas.seed[0]).toEqual({ id: "c-1", branchId: "plaza-norte", mesa: "3", platillo: "enchiladas", items: [{ platillo: "enchiladas", cantidad: 2 }] });
    const manifest = normalizeManifest(liveManifest(result));
    expect(manifest?.collections.map((collection) => collection.key)).toEqual(["platillos", "comandas"]);
  });

  it("sin datos en vivo el plan queda como siempre", () => {
    const result = plan(false);
    expect(result.live).toBeUndefined();
    const comandas = result.entities.find((entity) => entity.key === "comandas")!;
    expect(comandas.scope).toBeUndefined();
    expect(comandas.fields.every((field) => field.type === "text" || field.type === "number")).toBe(true);
    expect(comandas.seed[0].id).toBeUndefined();
  });

  it("los prompts del generador explican el modo en vivo solo cuando aplica", () => {
    expect(planSystemPrompt("app", { live: true })).toContain("DATOS EN VIVO");
    expect(planSystemPrompt("app")).not.toContain("DATOS EN VIVO");
    expect(fileSystemPrompt("app", { live: true })).toContain("transact(");
    expect(fileSystemPrompt("app")).not.toContain("transact(");
  });
});

describe("Vega con datos en vivo", () => {
  const profile = {} as Parameters<typeof vegaSystemPrompt>[4];
  const connections = {} as Parameters<typeof vegaSystemPrompt>[1];
  const owner = { name: "Ule" } as unknown as Parameters<typeof vegaSystemPrompt>[0];

  it("solo menciona datos en vivo cuando están disponibles y dice el precio", () => {
    expect(liveAppsPrompt).toContain(`${LIVE_APP_BUILD_PRICE} créditos`);
    expect(liveAppsPrompt).toContain("datos_en_vivo: true");
    const on = vegaSystemPrompt(owner, connections, false, [], profile, new Date(), undefined, { liveApps: true });
    const off = vegaSystemPrompt(owner, connections, false, [], profile, new Date(), undefined, {});
    expect(on).toContain("Datos en vivo:");
    expect(off).not.toContain("Datos en vivo:");
  });

  it("entregar_proyecto acepta datos_en_vivo", () => {
    const tool = vegaTools(connections, false).find((item) => item.name === "entregar_proyecto");
    expect((tool?.parameters as { properties: Record<string, unknown> }).properties.datos_en_vivo).toBeTruthy();
  });
});
