import { describe, expect, it } from "vitest";

import { profilePrompt, type VegaProfile } from "@/lib/vega/profile";

const empty: VegaProfile = {
  business: null,
  goals: null,
  tone: null,
  markets: null,
  services: null,
  hours: null,
  team: null,
  notes: null,
};

describe("profilePrompt", () => {
  it("no invita a llenar un formulario cuando el perfil está vacío", () => {
    const text = profilePrompt(empty);
    expect(text).toContain("recordar");
    expect(text).not.toMatch(/panel Perfil|formulario de perfil no/i);
    expect(text).toContain("No le pidas que llene un formulario de perfil");
  });

  it("incluye los datos ya guardados y permite actualizarlos", () => {
    const text = profilePrompt({ ...empty, business: "Taquería Las 3 Huastecas", tone: "cercano" });
    expect(text).toContain("Taquería Las 3 Huastecas");
    expect(text).toContain("cercano");
    expect(text).toMatch(/actualizar_perfil|recordar/);
    expect(text).not.toMatch(/panel Perfil/);
  });
});
