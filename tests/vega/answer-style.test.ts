import { describe, expect, it } from "vitest";

import { appTools } from "@/lib/vega/app-tools";
import { noConnections, type VegaConnections } from "@/lib/vega/apps";
import { chatGeneration, expertStylePrompt, findToolNameLeaks, humanizeToolNames, opensWithRefusal, toolLabels } from "@/lib/vega/answer-style";
import { backgroundJobTool, delegateTool } from "@/lib/vega/jobs-core";
import { vegaSystemPrompt } from "@/lib/vega/prompt";
import { vegaTools } from "@/lib/vega/tools";
import { xTools } from "@/lib/vega/x/tools";

import { badRestaurantAnswer, goodRestaurantAnswer, productionRefusalAnswer, proposeAndBuildAnswer, restaurantPrompt, restaurantSystemPrompt } from "./fixtures/restaurante-3-huastecas";

const user = { name: "Ule", package: "STARTED" } as const;
const profile = { business: null, goals: null, tone: null, markets: null, services: null, hours: null, team: null, notes: null };
const allConnections = Object.fromEntries(Object.keys(noConnections).map((key) => [key, true])) as VegaConnections;

describe("estilo de respuesta experto (caso Las 3 Huastecas)", () => {
  it("el fixture es el caso real del restaurante", () => {
    expect(restaurantPrompt).toContain("Las 3 Huastecas");
    expect(restaurantPrompt).toMatch(/comandas/);
  });

  it("el prompt de sistema pide responder como experto, sin negativas ni nombres internos", () => {
    const prompt = vegaSystemPrompt(user, noConnections, true, [], profile, new Date("2026-11-21T13:00:00Z"));
    expect(prompt).toContain(expertStylePrompt);
    expect(prompt).not.toMatch(/Evita tablas/);
    expect(expertStylePrompt).toMatch(/Nunca abras con lo que no puedes/i);
    expect(expertStylePrompt).toMatch(/nombres internos/i);
    expect(expertStylePrompt).toMatch(/tablas/);
    expect(expertStylePrompt).toMatch(/no inventes/i);
  });

  it("detecta la negativa al inicio de la mala respuesta y no en la buena", () => {
    expect(opensWithRefusal(badRestaurantAnswer)).toBe(true);
    expect(opensWithRefusal(goodRestaurantAnswer)).toBe(false);
    expect(opensWithRefusal("Lo siento, no tengo acceso a eso.")).toBe(true);
    expect(opensWithRefusal("¡Claro! Así lo armamos.\n\nPrimero las recetas.\n\nNo puedo conectarme a tu POS, pero te dejo el formato.")).toBe(false);
  });

  it("la buena respuesta cubre lo que importa del caso", () => {
    for (const topic of [/escandallo/i, /comanda/i, /merma/i, /corte de caja/i, /Soft Restaurant/, /Parrot/, /Loyverse/, /Plan/]) {
      expect(goodRestaurantAnswer).toMatch(topic);
    }
    expect(goodRestaurantAnswer).toMatch(/^\|.*\|$/m);
  });

  it("detecta y oculta nombres internos de herramientas", () => {
    expect(findToolNameLeaks(badRestaurantAnswer)).toContain("entregar_proyecto");
    expect(findToolNameLeaks(goodRestaurantAnswer)).toEqual([]);
    const cleaned = humanizeToolNames(badRestaurantAnswer);
    expect(findToolNameLeaks(cleaned)).toEqual([]);
    expect(cleaned).not.toContain("entregar_proyecto");
    expect(humanizeToolNames(goodRestaurantAnswer)).toBe(goodRestaurantAnswer);
  });

  it("todas las herramientas declaradas tienen una etiqueta legible", () => {
    const names = [
      ...vegaTools(allConnections, true).map((tool) => tool.name),
      ...appTools(allConnections).map((tool) => tool.name),
      ...xTools().map((tool) => tool.name),
      backgroundJobTool,
      delegateTool,
    ];
    const missing = [...new Set(names)].filter((name) => !toolLabels[name]);
    expect(missing).toEqual([]);
  });

  it("deja espacio para respuestas largas y estructuradas", () => {
    expect(chatGeneration.maxOutputTokens).toBeGreaterThan(4096);
    expect(chatGeneration.temperature).toBeLessThanOrEqual(0.7);
  });

  it("caso real de producción: detecta la lista de «no puedo» y acepta proponer y construir", () => {
    expect(restaurantSystemPrompt).toMatch(/2 sucursales/);
    expect(opensWithRefusal(productionRefusalAnswer)).toBe(true);
    expect(opensWithRefusal(proposeAndBuildAnswer)).toBe(false);
    expect(findToolNameLeaks(proposeAndBuildAnswer)).toEqual([]);
  });

  it("el prompt y la herramienta de entregas ya no empujan a listar lo que la app no hace", () => {
    const prompt = vegaSystemPrompt(user, allConnections, true, [], profile, new Date("2026-11-21T13:00:00Z"));
    const deliver = vegaTools(allConnections, true).find((tool) => tool.name === "entregar_proyecto");
    const text = `${prompt}\n${deliver?.description ?? ""}`;
    expect(deliver).toBeDefined();
    for (const pushy of [/No las describas como sistemas con servidor/, /nunca la presentes como sistema listo/, /aún sin base de datos propia/, /No digas que el archivo trae base de datos/]) {
      expect(text).not.toMatch(pushy);
    }
    expect(prompt).toMatch(/propón la solución completa/);
    expect(prompt).toMatch(/construye la primera fase/);
  });
});
