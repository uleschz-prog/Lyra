import { describe, expect, it } from "vitest";

import { noConnections } from "@/lib/vega/apps";
import { vegaSystemPrompt } from "@/lib/vega/prompt";

const user = { id: "user-1", name: "Ana", package: "STARTED" } as const;
const profile = {
  business: null,
  goals: null,
  tone: null,
  markets: null,
  services: null,
  hours: null,
  team: null,
  notes: null,
};

describe("identidad de agentes Vega", () => {
  it("mantiene la identidad original del agente principal", () => {
    const prompt = vegaSystemPrompt(user, noConnections, false, [], profile, new Date("2026-01-01T12:00:00Z"), {
      name: "Vega",
      specialty: "Asistente general",
      instructions: "",
      isDefault: true,
    });

    expect(prompt).toContain("Eres Vega, el superagente de LYRA.");
  });

  it("añade la especialidad e instrucciones sin reemplazar las capacidades compartidas", () => {
    const prompt = vegaSystemPrompt(user, noConnections, false, [], profile, new Date("2026-01-01T12:00:00Z"), {
      name: "Luna",
      specialty: "Marketing y redes sociales",
      instructions: "Propón ideas prácticas y usa un tono cercano.",
      isDefault: false,
    });

    expect(prompt).toContain("Eres Luna, un agente de LYRA especializado en Marketing y redes sociales.");
    expect(prompt).toContain("Propón ideas prácticas y usa un tono cercano.");
    expect(prompt).toContain("Espacio de trabajo");
    expect(prompt).not.toContain("Eres Vega, el superagente de LYRA.");
  });
});
