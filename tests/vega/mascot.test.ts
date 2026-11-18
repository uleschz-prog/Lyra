import { describe, expect, it } from "vitest";

import {
  cleanMascotCode,
  defaultMascot,
  encodeMascot,
  isMascotCode,
  mascotColors,
  mascotOf,
  mascotShapes,
  pickableShapes,
} from "@/lib/vega/mascot";

describe("mascotas de agentes", () => {
  it("codifica y decodifica todas las formas y colores", () => {
    for (const shape of mascotShapes) {
      for (const color of mascotColors) {
        const code = encodeMascot({ shape, color });
        expect(code.length).toBeLessThanOrEqual(8);
        expect(isMascotCode(code)).toBe(true);
        expect(mascotOf({ id: "x", avatar: code })).toEqual({ shape, color });
      }
    }
  });

  it("Vega es la mascota violeta con su forma propia", () => {
    expect(defaultMascot({ id: "abc", isDefault: true })).toEqual({ shape: "vega", color: "violet" });
    expect(mascotOf({ id: "abc", isDefault: true, avatar: "✦" })).toEqual({ shape: "vega", color: "violet" });
  });

  it("da a cada agente una mascota estable según su id", () => {
    const first = defaultMascot({ id: "agente-123" });
    expect(defaultMascot({ id: "agente-123" })).toEqual(first);
    expect(pickableShapes).toContain(first.shape);
    const variety = new Set(Array.from({ length: 40 }, (_, index) => encodeMascot(defaultMascot({ id: `a${index}` }))));
    expect(variety.size).toBeGreaterThan(10);
  });

  it("los avatares viejos (emoji) usan la mascota por defecto", () => {
    expect(mascotOf({ id: "luna", avatar: "🦊" })).toEqual(defaultMascot({ id: "luna" }));
  });

  it("rechaza códigos inválidos", () => {
    expect(isMascotCode("m:zz")).toBe(false);
    expect(isMascotCode("🤖")).toBe(false);
    expect(cleanMascotCode("m:qq")).toBeNull();
    expect(cleanMascotCode(42)).toBeNull();
    expect(cleanMascotCode("m:gp")).toBe("m:gp");
  });
});
