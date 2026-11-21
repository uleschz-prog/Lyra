import { describe, expect, it } from "vitest";

import { noConnections, type VegaConnections } from "@/lib/vega/apps";
import { vegaSystemPrompt } from "@/lib/vega/prompt";
import type { VegaProfile } from "@/lib/vega/profile";

const emptyProfile: VegaProfile = {
  business: null,
  goals: null,
  tone: null,
  markets: null,
  services: null,
  hours: null,
  team: null,
  notes: null,
};

function prompt(connections: VegaConnections = noConnections) {
  return vegaSystemPrompt({ name: "Ule", package: "VEGA" }, connections, false, [], emptyProfile, new Date("2026-11-21T16:00:00Z"));
}

describe("vegaSystemPrompt · conexiones", () => {
  it("pide usar la tarjeta pedir_conexion y no mandar al socio a un panel", () => {
    const text = prompt();
    expect(text).toContain("pedir_conexion");
    expect(text).toContain("Nunca le pidas que vaya a un panel");
    expect(text).toContain("usa pedir_conexion con whatsapp");
    expect(text).not.toMatch(/dile que lo conecte en Conexiones/);
    expect(text).not.toMatch(/panel Perfil/);
  });

  it("aclara con honestidad lo que no se puede conectar", () => {
    const text = prompt();
    expect(text).toContain("No hay conexión de Telegram");
    expect(text).toContain("WhatsApp personal");
    expect(text).toContain("mensajes directos");
  });

  it("menciona Ajustes en lugar de los paneles de la columna derecha", () => {
    const text = prompt();
    expect(text).toContain("Ajustes → Archivos");
    expect(text).toContain("Ajustes → Memoria");
    expect(text).not.toMatch(/panel Archivos|panel Memoria/);
  });
});
