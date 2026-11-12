import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/credits", () => ({ chargeCredits: vi.fn(), refundCharge: vi.fn(), creditPrices: { speech: 3 } }));

import { narrationKey, narrationMaxAttempts, planNarrationAttempt } from "@/lib/studio/narration-charge";

describe("narración cobrada una sola vez", () => {
  it("el primer intento usa la clave 1", () => {
    expect(planNarrationAttempt([])).toEqual({ ok: true, attempt: 1 });
    expect(narrationKey("gen1", 1)).toBe("narration:gen1:1");
  });

  it("si ya hay un cobro vigente bloquea la repetición", () => {
    const plan = planNarrationAttempt([{ attempt: 1, chargeId: "t1", refunded: false }]);
    expect(plan).toMatchObject({ ok: false, status: 409 });
  });

  it("un intento reembolsado libera el siguiente", () => {
    expect(planNarrationAttempt([{ attempt: 1, chargeId: "t1", refunded: true }])).toEqual({ ok: true, attempt: 2 });
  });

  it("se agotan los intentos", () => {
    const all = Array.from({ length: narrationMaxAttempts }, (_, index) => ({ attempt: index + 1, chargeId: `t${index}`, refunded: true }));
    expect(planNarrationAttempt(all)).toMatchObject({ ok: false, status: 429 });
  });
});
