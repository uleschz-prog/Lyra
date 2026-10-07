import { describe, expect, it } from "vitest";

import { onboardingPath } from "@/lib/auth/onboarding";

describe("alta", () => {
  it("pide MetaMask y después el pago cuando todavía no hay paquete", () => {
    expect(onboardingPath({ role: "MEMBER", package: "NONE", polygonWallet: null })).toBe("/vincular");
    expect(onboardingPath({ role: "MEMBER", package: "NONE", polygonWallet: "0xabc" })).toBe("/pago");
  });

  it("deja entrar a quien ya pagó y al administrador", () => {
    expect(onboardingPath({ role: "MEMBER", package: "PRO", polygonWallet: null })).toBeNull();
    expect(onboardingPath({ role: "ADMIN", package: "NONE", polygonWallet: null })).toBeNull();
  });
});
