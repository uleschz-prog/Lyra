import { describe, expect, it } from "vitest";

import { sponsorMoveBlock } from "@/lib/admin/sponsor-move";

describe("cambio de patrocinio", () => {
  const downline = new Set(["hijo", "nieto"]);

  it("rechaza un ciclo, a la misma persona y al patrocinador actual", () => {
    expect(
      sponsorMoveBlock({ userId: "ana", currentSponsorId: "raiz", nextSponsorId: "ana", downlineIds: downline }),
    ).toMatch(/sí misma/);
    expect(
      sponsorMoveBlock({ userId: "ana", currentSponsorId: "raiz", nextSponsorId: "nieto", downlineIds: downline }),
    ).toMatch(/propio equipo/);
    expect(
      sponsorMoveBlock({ userId: "ana", currentSponsorId: "raiz", nextSponsorId: "raiz", downlineIds: downline }),
    ).toMatch(/ya está bajo/);
  });

  it("acepta un patrocinador que no está en su equipo", () => {
    expect(
      sponsorMoveBlock({ userId: "ana", currentSponsorId: "raiz", nextSponsorId: "otro", downlineIds: downline }),
    ).toBeNull();
  });
});
