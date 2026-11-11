import { describe, expect, it } from "vitest";

import { isProviderEmailVerified, pickGithubEmail } from "@/lib/auth/oauth-email";

describe("isProviderEmailVerified", () => {
  it("solo un correo marcado como verificado por el proveedor se acepta", () => {
    expect(isProviderEmailVerified(true)).toBe(true);
    expect(isProviderEmailVerified("true")).toBe(true);
    expect(isProviderEmailVerified(false)).toBe(false);
    expect(isProviderEmailVerified("false")).toBe(false);
    expect(isProviderEmailVerified(undefined)).toBe(false);
    expect(isProviderEmailVerified(1)).toBe(false);
  });
});

describe("pickGithubEmail", () => {
  it("solo aporta un correo con verified true, priorizando el primario", () => {
    expect(
      pickGithubEmail([
        { email: "otro@ejemplo.com", primary: false, verified: true },
        { email: "dueno@ejemplo.com", primary: true, verified: true },
        { email: "falso@ejemplo.com", primary: true, verified: false },
      ]),
    ).toBe("dueno@ejemplo.com");
    expect(pickGithubEmail([{ email: "sin-verificar@ejemplo.com", primary: true, verified: false }])).toBeNull();
    expect(pickGithubEmail(null)).toBeNull();
  });
});
