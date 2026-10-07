import { describe, expect, it } from "vitest";

import { onboardingPath } from "@/lib/auth/onboarding";

describe("alta", () => {
  it("iniciar sesión no manda al pago aunque falte el paquete", () => {
    expect(onboardingPath({ role: "MEMBER", package: "NONE", polygonWallet: null })).toBeNull();
    expect(onboardingPath({ role: "MEMBER", package: "NONE", polygonWallet: "0xabc" })).toBeNull();
    expect(onboardingPath({ role: "MEMBER", package: "PRO", polygonWallet: null })).toBeNull();
    expect(onboardingPath({ role: "ADMIN", package: "NONE", polygonWallet: null })).toBeNull();
  });
});
