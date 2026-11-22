import { describe, expect, it } from "vitest";

import { checkScore, cleanPlayerName, gameSpaceSchema, issueRunToken, leaderboardLimits, readRunToken } from "@/lib/games/leaderboard";

const env = { SESSION_SECRET: "secreto-de-prueba-para-fichas-1234567890" };
const bounds = { maxScore: 50_000, maxPerSecond: 200 };

describe("ranking en línea · validación", () => {
  it("limpia nombres y rechaza vacíos, enlaces y groserías", () => {
    expect(cleanPlayerName("  Ana   María  ")).toBe("Ana María");
    expect(cleanPlayerName("<script>Ule</script>")).toBe("scriptUlescript");
    expect(cleanPlayerName("Ñandú_99")).toBe("Ñandú_99");
    expect(cleanPlayerName("x")).toBeNull();
    expect(cleanPlayerName("www.spam.com")).toBeNull();
    expect(cleanPlayerName("p.e.n.d.e.j.o")).toBeNull();
    expect(cleanPlayerName(42)).toBeNull();
    expect(cleanPlayerName("Nombre larguísimo de más de dieciséis")?.length).toBe(leaderboardLimits.nameMax);
  });

  it("la ficha de partida es del espacio, no se puede alterar y lleva la hora del servidor", () => {
    const start = new Date("2026-11-21T00:00:00Z");
    const token = issueRunToken("space1", start, env);
    expect(readRunToken(token, "space1", env)).toMatchObject({ startedAt: start.getTime() });
    expect(readRunToken(token, "space2", env)).toBeNull();
    const [, nonce, sig] = token.split(".");
    expect(readRunToken(`${(start.getTime() - 3_600_000).toString(36)}.${nonce}.${sig}`, "space1", env)).toBeNull();
    expect(readRunToken("basura", "space1", env)).toBeNull();
    expect(readRunToken(token, "space1", { SESSION_SECRET: "otro-secreto-distinto-1234567890" })).toBeNull();
  });

  it("cotas: entero positivo, máximo del juego y puntos por segundo creíbles", () => {
    expect(checkScore({ score: 1200, elapsedMs: 30_000, bounds })).toEqual({ ok: true, score: 1200 });
    expect(checkScore({ score: 0, elapsedMs: 30_000, bounds }).ok).toBe(false);
    expect(checkScore({ score: 12.5, elapsedMs: 30_000, bounds }).ok).toBe(false);
    expect(checkScore({ score: "100", elapsedMs: 30_000, bounds }).ok).toBe(false);
    expect(checkScore({ score: 60_000, elapsedMs: 3_000_000, bounds })).toMatchObject({ ok: false, error: expect.stringMatching(/máximo/) });
    expect(checkScore({ score: 10_000, elapsedMs: 10_000, bounds })).toMatchObject({ ok: false, error: expect.stringMatching(/no es posible/) });
    expect(checkScore({ score: 50, elapsedMs: 1_000, bounds })).toMatchObject({ ok: false, error: expect.stringMatching(/corta/) });
    expect(checkScore({ score: 50, elapsedMs: 4 * 3_600_000, bounds })).toMatchObject({ ok: false, error: expect.stringMatching(/expiró/) });
  });

  it("solo reconoce espacios de juego", () => {
    expect(gameSpaceSchema({ kind: "game", versionId: "v1", title: "T", maxScore: 10, maxPerSecond: 1 })).toMatchObject({ kind: "game" });
    expect(gameSpaceSchema({ version: 1, title: "App", collections: [] })).toBeNull();
  });
});
