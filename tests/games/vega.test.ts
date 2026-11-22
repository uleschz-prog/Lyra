import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ getPrisma: vi.fn() }));

const { noConnections } = await import("@/lib/vega/apps");
const { briefGate, briefQuestions, wantsLeaderboard } = await import("@/lib/vega/briefing");
const { vegaSystemPrompt } = await import("@/lib/vega/prompt");
const { runVegaTool, vegaTools } = await import("@/lib/vega/tools");
const { madeWithBadge, publishedPageHtml } = await import("@/lib/publish/page");

const emptyProfile = { business: null, goals: null, tone: null, markets: null, services: null, hours: null, team: null, notes: null };

describe("Vega sabe hacer juegos", () => {
  it("el prompt ofrece juegos con precio, géneros y límites honestos (solo si los pide)", () => {
    const text = vegaSystemPrompt({ name: "Ule", package: "VEGA" }, noConnections, false, [], emptyProfile, new Date("2026-11-21T16:00:00Z"));
    expect(text).toContain("tipo «juego»");
    expect(text).toMatch(/arcade, plataformas 2D, puzzle, trivia, cartas o memoria, runner y 3D sencillo/);
    expect(text).toContain("Cuesta 10 créditos, o 20 con ranking en línea");
    expect(text).toMatch(/Solo si el socio pide algo fuera de alcance/);
    expect(text).toMatch(/multijugador en tiempo real/);
    expect(text).toMatch(/no copies nombres, personajes ni marcas/);
    expect(text).toMatch(/editar_proyecto \(velocidad/);
  });

  it("entregar_proyecto acepta tipo juego y ranking_en_linea; secciones ya no son obligatorias", () => {
    const tool = vegaTools(noConnections, false).find((item) => item.name === "entregar_proyecto")!;
    const params = tool.parameters as { properties: Record<string, { enum?: string[]; description?: string }>; required: string[] };
    expect(params.properties.tipo.enum).toContain("juego");
    expect(params.properties.ranking_en_linea.description).toMatch(/20 créditos en vez de 10/);
    expect(params.required).not.toContain("secciones");
    expect(tool.description).toMatch(/Juegos \(tipo juego\)/);
    const edit = vegaTools(noConnections, false).find((item) => item.name === "editar_proyecto")!;
    expect(edit.description).toMatch(/sitio, app o juego/);
  });

  it("el briefing de juego pide idea, tipo y ranking", () => {
    expect(briefQuestions.juego.filter((question) => question.required).map((question) => question.key)).toEqual(["idea", "genero", "ranking"]);
    const gate = briefGate("entregar_proyecto", { tipo: "juego", briefing: { idea: "Taco que esquiva chiles" } }, "hazme un juego");
    expect(gate).toMatchObject({ ok: false, request: { kind: "juego", missing: ["genero", "ranking"] } });
    expect(briefGate("entregar_proyecto", { tipo: "juego", briefing: { idea: "Taco que esquiva chiles", genero: "Arcade", ranking: "No, solo récord personal" } }, "va").ok).toBe(true);
  });

  it("ranking: parámetro explícito o respuesta «Sí» del briefing", () => {
    expect(wantsLeaderboard({ ranking_en_linea: true })).toBe(true);
    expect(wantsLeaderboard({ ranking_en_linea: false, briefing: { ranking: "Sí, con ranking en línea" } })).toBe(false);
    expect(wantsLeaderboard({ briefing: { ranking: "Sí, con ranking en línea" } })).toBe(true);
    expect(wantsLeaderboard({ briefing: { ranking: "No, solo récord personal" } })).toBe(false);
  });

  it("la entrega de respaldo de un juego es el juego base y lo dice", async () => {
    const outcome = await runVegaTool("u1", "entregar_proyecto", { tipo: "juego", titulo: "Taco Esquiva", resumen: "Un taco que esquiva chiles", briefing: { ranking: "Sí, con ranking en línea" } });
    expect(outcome.kind).toBe("delivery");
    if (outcome.kind !== "delivery") return;
    expect(outcome.payload).toMatchObject({ kind: "juego", title: "Taco Esquiva" });
    expect(outcome.modelNote).toMatch(/no el juego que pidió/);
  });
});

describe("/s/ para juegos", () => {
  it("el sello va abajo al centro y chico para no tapar controles", () => {
    expect(madeWithBadge("https://lyyra.vercel.app", "game")).toMatch(/left:50%.*ref=juego|ref=juego.*left:50%/);
    const html = publishedPageHtml("<html><head></head><body></body></html>", { title: "J", description: "d", url: "u", indexable: false, appUrl: "https://lyyra.vercel.app" }, "", "", { badge: "game" });
    expect(html).toContain("ref=juego");
    expect(html).not.toContain("right:12px;bottom:12px");
  });
});
