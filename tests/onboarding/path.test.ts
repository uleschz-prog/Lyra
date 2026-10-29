import { describe, expect, it } from "vitest";

import { onboardingPath } from "@/lib/auth/onboarding";

describe("alta", () => {
  it("iniciar sesión no manda al pago aunque falte el paquete", () => {
    expect(onboardingPath({ role: "MEMBER", package: "NONE" })).toBeNull();
    expect(onboardingPath({ role: "MEMBER", package: "PRO" })).toBeNull();
    expect(onboardingPath({ role: "ADMIN", package: "NONE" })).toBeNull();
  });
});
