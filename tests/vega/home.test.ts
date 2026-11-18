import { describe, expect, it } from "vitest";

import { byRecent, homeLayout, lastMessageOf, matchesAgent, previewText, relativeDay } from "@/lib/vega/home";

const tz = "America/Mexico_City";
// 18 nov 2026, 16:00 en Ciudad de México (UTC-6).
const now = new Date("2026-11-18T22:00:00Z");

function agent(id: string, opts: { isDefault?: boolean; at?: string; text?: string; fromUser?: boolean } = {}) {
  return {
    id,
    name: id === "vega" ? "Vega" : `Agente ${id}`,
    specialty: `Especialidad ${id}`,
    isDefault: Boolean(opts.isDefault),
    last: opts.at ? { text: opts.text ?? `hola ${id}`, fromUser: Boolean(opts.fromUser), at: opts.at, chatId: `c-${id}` } : null,
  };
}

describe("previewText y lastMessageOf", () => {
  it("quita Markdown y saltos y recorta", () => {
    expect(previewText("**Hola**\n\n_mundo_ `x`")).toBe("Hola mundo x");
    expect(previewText("a".repeat(200))?.length).toBe(90);
    expect(previewText("  ** ")).toBeNull();
    expect(previewText(null)).toBeNull();
  });

  it("marca si lo envió el socio y guarda la conversación", () => {
    const last = lastMessageOf({ content: "Arma mi sitio", role: "user", createdAt: new Date("2026-10-30T18:00:00Z"), conversationId: "conv1" });
    expect(last).toEqual({ text: "Arma mi sitio", fromUser: true, at: "2026-10-30T18:00:00.000Z", chatId: "conv1" });
    expect(lastMessageOf({ content: "Listo", role: "assistant", createdAt: "2026-10-30T18:00:00Z", conversationId: "c" })?.fromUser).toBe(false);
    expect(lastMessageOf(null)).toBeNull();
    expect(lastMessageOf({ content: "   ", role: "user", createdAt: new Date(), conversationId: "c" })).toBeNull();
  });
});

describe("relativeDay", () => {
  it("usa fechas cortas en español", () => {
    expect(relativeDay("2026-11-18T21:59:30Z", now, tz)).toBe("ahora");
    expect(relativeDay("2026-11-18T20:05:00Z", now, tz)).toBe("14:05");
    expect(relativeDay("2026-11-17T20:00:00Z", now, tz)).toBe("ayer");
    expect(relativeDay("2026-11-15T20:00:00Z", now, tz)).toMatch(/^dom/);
    expect(relativeDay("2026-10-30T18:00:00Z", now, tz)).toMatch(/^30 oct/);
    expect(relativeDay("2025-10-27T18:00:00Z", now, tz)).toMatch(/^27 oct.*2025$/);
  });

  it("no inventa fechas", () => {
    expect(relativeDay(null, now, tz)).toBe("");
    expect(relativeDay("no-es-fecha", now, tz)).toBe("");
  });
});

describe("homeLayout", () => {
  const agents = [
    agent("vega", { isDefault: true, at: "2026-11-18T10:00:00Z" }),
    agent("a", { at: "2026-10-27T10:00:00Z" }),
    agent("b"),
    agent("c", { at: "2026-10-30T10:00:00Z" }),
  ];

  it("pone a Vega y al más reciente arriba si no hay favorito", () => {
    const layout = homeLayout(agents, null);
    expect(layout.main?.id).toBe("vega");
    expect(layout.companion?.id).toBe("c");
    expect(layout.companionIsFavorite).toBe(false);
    expect(layout.rest.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("respeta el favorito y lo marca", () => {
    const layout = homeLayout(agents, "b");
    expect(layout.companion?.id).toBe("b");
    expect(layout.companionIsFavorite).toBe(true);
    expect(layout.rest.map((item) => item.id)).toEqual(["c", "a"]);
  });

  it("ignora un favorito que ya no existe o que es Vega", () => {
    expect(homeLayout(agents, "borrado").companion?.id).toBe("c");
    expect(homeLayout(agents, "vega").companionIsFavorite).toBe(false);
  });

  it("solo Vega: sin acompañante ni lista", () => {
    const layout = homeLayout([agent("vega", { isDefault: true })], null);
    expect(layout.companion).toBeNull();
    expect(layout.rest).toEqual([]);
  });

  it("ordena por reciente y deja al final los que no tienen mensajes", () => {
    expect(byRecent(agents).map((item) => item.id)).toEqual(["vega", "c", "a", "b"]);
  });
});

describe("matchesAgent", () => {
  it("busca en nombre, especialidad y último mensaje sin importar mayúsculas", () => {
    const item = agent("a", { at: "2026-10-27T10:00:00Z", text: "Cotización para Óscar" });
    expect(matchesAgent(item, "agente A")).toBe(true);
    expect(matchesAgent(item, "especialidad")).toBe(true);
    expect(matchesAgent(item, "óscar")).toBe(true);
    expect(matchesAgent(item, "zzz")).toBe(false);
    expect(matchesAgent(item, "  ")).toBe(true);
  });
});
