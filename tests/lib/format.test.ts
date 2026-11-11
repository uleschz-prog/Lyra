import { describe, expect, it } from "vitest";

import { canAccess } from "@/lib/format";

describe("acceso por rango", () => {
  it("permite el rango requerido y los superiores", () => {
    expect(canAccess("ALPHA", "ALPHA")).toBe(true);
    expect(canAccess("CONSTELLATION", "VEGA")).toBe(true);
  });

  it("no permite rangos inferiores", () => {
    expect(canAccess("NOVA", "ALPHA")).toBe(false);
  });
});
