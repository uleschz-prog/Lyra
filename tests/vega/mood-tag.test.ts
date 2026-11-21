import { describe, expect, it } from "vitest";

import { noConnections, userToolkits, type VegaConnections } from "@/lib/vega/apps";
import { createMoodFilter, stripMoodTags } from "@/lib/vega/mood-tag";
import { vegaSystemPrompt } from "@/lib/vega/prompt";
import type { VegaProfile } from "@/lib/vega/profile";

const emptyProfile: VegaProfile = { business: null, goals: null, tone: null, markets: null, services: null, hours: null, team: null, notes: null };

function stream(chunks: string[]) {
  const filter = createMoodFilter();
  return chunks.map((chunk) => filter.push(chunk)).join("") + filter.end();
}

describe("etiqueta de ánimo («¿Lyra está feliz?»)", () => {
  it("el prompt ya no le pide a Vega escribir su estado de ánimo", () => {
    const all = Object.fromEntries(userToolkits.map((toolkit) => [toolkit, true])) as VegaConnections;
    for (const connections of [all, noConnections]) {
      const prompt = vegaSystemPrompt({ name: "Ule", package: "VEGA" }, connections, false, [], emptyProfile, new Date("2026-11-21T16:00:00Z"));
      expect(prompt).not.toMatch(/\[animo|estado de ánimo|Emociones:/i);
    }
  });

  it("quita la etiqueta en cualquier parte, con acento, mayúsculas o negritas", () => {
    expect(stripMoodTags("[animo: feliz] Hola")).toBe("Hola");
    expect(stripMoodTags("Listo.\n\n**[Ánimo: Feliz]** Ya quedó")).toBe("Listo.\n\nYa quedó");
    expect(stripMoodTags("[animo: entusiasta]\n¡Va!")).toBe("¡Va!");
    expect(stripMoodTags("Mira [este enlace](https://lyra.mx)")).toBe("Mira [este enlace](https://lyra.mx)");
  });

  it("no se escapa aunque llegue partida entre fragmentos del stream", () => {
    expect(stream(["Revisé tu Gmail. ", "[an", "imo: fe", "liz] Ya está."])).toBe("Revisé tu Gmail. Ya está.");
    expect(stream(["Hecho ", "[", "animo:", " feliz]", " y listo"])).toBe("Hecho y listo");
    expect(stream(["Usa [a", "lguien] y [Clientes]"])).toBe("Usa [alguien] y [Clientes]");
    expect(stream(["Termina en [an"])).toBe("Termina en [an");
  });
});
