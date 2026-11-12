import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GeminiContent, GeminiPart } from "@/lib/vega/gemini-stream";
import type { ModelStream } from "@/lib/vega/model-gateway";
import {
  briefGate,
  briefingSchema,
  briefKindForTool,
  briefQuestions,
  composeBriefPrompt,
  isDelegation,
  missingBrief,
  type BriefKind,
} from "@/lib/vega/briefing";

import { table } from "./fake-prisma";

const db = vi.hoisted(() => ({ current: null as unknown }));
const openVegaStream = vi.hoisted(() => vi.fn());
const runVegaTool = vi.hoisted(() => vi.fn());
const chargeCredits = vi.hoisted(() => vi.fn(async () => ({ ok: true, duplicate: false, chargeId: "tool-charge", balance: 10 })));

vi.mock("@/lib/prisma", () => ({ getPrisma: () => db.current }));
vi.mock("@/lib/credits", () => ({
  creditPrices: { vegaMessage: 1, vegaTool: 2 },
  chargeCredits,
  refundCharge: async () => undefined,
  currentCredits: async () => 10,
}));
vi.mock("@/lib/vega/model-gateway", () => ({ openVegaStream }));
vi.mock("@/lib/vega/tools", () => ({
  freeTools: new Set<string>(),
  runVegaTool,
  vegaTools: () => [],
  executeVegaAction: vi.fn(),
  connectDraft: vi.fn(),
}));
vi.mock("@/lib/vega/autonomy", () => ({ evaluateAutonomy: vi.fn(async () => ({ ok: true })), autonomyPrompt: async () => "" }));
vi.mock("@/lib/ai/composio", () => ({ composioConfigured: () => false }));
vi.mock("@/lib/ai/composio-user", () => ({ userConnections: vi.fn() }));
vi.mock("@/lib/vega/summary", () => ({ HISTORY: 24, SUMMARY_SLACK: 8, scheduleSummary: vi.fn(), summaryContext: () => "" }));

const { runVegaTurn } = await import("@/lib/vega/turn");
const { briefFromDelivery } = await import("@/lib/builder/runner");

const full: Record<BriefKind, Record<string, string>> = {
  sitio: { negocio: "Sonríe Pachuca, clínica dental", objetivo: "Agendar citas", publico: "Familias de Pachuca", contacto: "WhatsApp 771 000 0000, español" },
  app: { proposito: "Tomar pedidos de pasteles", usuarios: "Mi equipo", datos: "Pedidos con cliente, fecha y total" },
  agente: { rol: "Atención a clientes de mi clínica", canal: "WhatsApp", tono: "Cálido y cercano", conocimiento: "Limpieza $600, lunes a sábado 9 a 19" },
  video: { tema: "Promo de limpieza dental", estilo: "Anuncio dinámico", formato: "9:16 (Reels / TikTok)" },
  imagen: { tema: "Logo de Sonríe Pachuca", estilo: "Minimalista", formato: "Cuadrada" },
};

describe("briefing: preguntas por tipo", () => {
  it("cada tipo tiene de 3 a 5 preguntas con opciones o texto libre", () => {
    for (const kind of Object.keys(briefQuestions) as BriefKind[]) {
      const questions = briefQuestions[kind];
      expect(questions.length).toBeGreaterThanOrEqual(3);
      expect(questions.length).toBeLessThanOrEqual(5);
      expect(questions.filter((question) => question.required).length).toBeGreaterThanOrEqual(3);
      expect(new Set(questions.map((question) => question.key)).size).toBe(questions.length);
    }
  });

  it("detecta el tipo por herramienta", () => {
    expect(briefKindForTool("crear_imagen", {})).toBe("imagen");
    expect(briefKindForTool("crear_video", {})).toBe("video");
    expect(briefKindForTool("entregar_proyecto", { tipo: "sitio" })).toBe("sitio");
    expect(briefKindForTool("entregar_proyecto", { tipo: "agente" })).toBe("agente");
    expect(briefKindForTool("buscar_web", {})).toBeNull();
  });

  it("las respuestas de relleno no cuentan", () => {
    expect(missingBrief("imagen", { tema: "por definir", estilo: "  ", formato: "Cuadrada" }).map((q) => q.key)).toEqual(["tema", "estilo"]);
    expect(missingBrief("sitio", full.sitio)).toEqual([]);
  });

  it("reconoce cuando el socio deja decidir a Vega", () => {
    expect(isDelegation("tú decide")).toBe(true);
    expect(isDelegation("Hazlo con lo que quieras")).toBe(true);
    expect(isDelegation("tu decides los colores")).toBe(true);
    expect(isDelegation("sorpréndeme")).toBe(true);
    expect(isDelegation("hazme un sitio para mi clínica")).toBe(false);
    expect(isDelegation(undefined)).toBe(false);
  });

  it("arma el mensaje con las respuestas del formulario", () => {
    const text = composeBriefPrompt("sitio", { ...full.sitio, estilo: "" });
    expect(text).toContain("Quiero crear un sitio web.");
    expect(text).toContain("- Negocio: Sonríe Pachuca, clínica dental");
    expect(text).not.toContain("Estilo");
    expect(composeBriefPrompt("imagen", {}, { delegate: true })).toMatch(/tú decide/);
    expect(isDelegation(composeBriefPrompt("app", {}, { delegate: true }))).toBe(true);
    expect(isDelegation(composeBriefPrompt("app", full.app))).toBe(false);
  });

  it("el esquema de la herramienta expone todos los campos", () => {
    const schema = briefingSchema(["sitio", "app", "agente"]);
    for (const key of ["negocio", "objetivo", "publico", "contacto", "proposito", "usuarios", "datos", "rol", "canal", "tono", "conocimiento"]) {
      expect(schema.properties).toHaveProperty(key);
    }
  });
});

describe("briefing: regla del servidor", () => {
  it("sin respuestas responde needs_brief con las preguntas que faltan", () => {
    const gate = briefGate("entregar_proyecto", { tipo: "sitio", titulo: "Clínica" }, "hazme un sitio");
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.estado).toBe("needs_brief");
    expect(gate.request).toEqual({ kind: "sitio", missing: ["negocio", "objetivo", "publico", "contacto"] });
    expect((gate.response.faltan as { pregunta: string }[])[0].pregunta).toMatch(/negocio/);
  });

  it("con las respuestas completas deja pasar", () => {
    for (const kind of ["sitio", "app", "agente"] as const) {
      expect(briefGate("entregar_proyecto", { tipo: kind, briefing: full[kind] }, "va").ok).toBe(true);
    }
    expect(briefGate("crear_video", { briefing: full.video }, "va").ok).toBe(true);
    expect(briefGate("crear_imagen", { briefing: full.imagen }, "va").ok).toBe(true);
    expect(briefGate("buscar_web", {}, "hola").ok).toBe(true);
  });

  it("con «tú decide» pasa solo si declara supuestos", () => {
    const missing = briefGate("crear_imagen", { descripcion: "logo" }, "hazme un logo, tú decide");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.response.estado).toBe("faltan_supuestos");
    expect(briefGate("crear_imagen", { descripcion: "logo", supuestos: "Estilo minimalista, cuadrada" }, "tú decide")).toEqual({ ok: true, delegated: true });
  });
});

function stream(...parts: GeminiPart[]): ModelStream {
  return {
    ok: true,
    provider: "gemini",
    model: "gemini-2.5-flash",
    usage: { provider: "gemini", model: "gemini-2.5-flash", inputTokens: 10, outputTokens: 5, reportedCostUsd: null },
    parts: (async function* () {
      yield* parts;
    })(),
    state: { truncated: false, fallbackReason: null },
  };
}

function turn(first: ModelStream, contents: GeminiContent[], userMessage: string, source?: "routine") {
  return {
    userId: "u1",
    chatId: "c1",
    chargeId: "msg-charge",
    chargeKey: "vega:u1:r1",
    balance: 10,
    model: "gemini-2.5-flash",
    system: "sys",
    tools: [],
    contents,
    startedAt: Date.now(),
    userMessage,
    first,
    ...(source ? { source } : {}),
  };
}

beforeEach(() => {
  db.current = {
    vegaAction: table(() => ({ status: "done", result: null })),
    vegaMessage: table(),
    vegaConversation: { update: async () => ({}) },
    vegaUsageLog: table(),
  };
  openVegaStream.mockReset();
  runVegaTool.mockReset();
  chargeCredits.mockClear();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("briefing en el turno de Vega", () => {
  it("sin briefing no ejecuta la herramienta, no cobra y muestra el formulario", async () => {
    openVegaStream.mockResolvedValueOnce(stream({ text: "¿Cómo se llama tu negocio?" }));
    const contents: GeminiContent[] = [{ role: "user", parts: [{ text: "hazme un logo" }] }];
    const events: { t: string; v: unknown }[] = [];
    const first = stream({ functionCall: { name: "crear_imagen", args: { descripcion: "logo genérico" } } });
    await runVegaTurn(turn(first, contents, "hazme un logo"), (event) => events.push(event as { t: string; v: unknown }));

    expect(runVegaTool).not.toHaveBeenCalled();
    expect(chargeCredits).not.toHaveBeenCalled();
    expect(events).toContainEqual({ t: "brief", v: { kind: "imagen", missing: ["tema", "estilo", "formato"] } });
    const response = contents.find((content, index) => index > 0 && content.role === "user")!.parts[0].functionResponse!.response;
    expect(response).toMatchObject({ estado: "needs_brief", tipo: "imagen" });
  });

  it("con el briefing respondido crea y cobra la herramienta", async () => {
    runVegaTool.mockResolvedValue({ kind: "result", status: "Listo", response: { ok: true } });
    openVegaStream.mockResolvedValueOnce(stream({ text: "Ahí va." }));
    const first = stream({ functionCall: { name: "crear_imagen", args: { descripcion: "logo", briefing: full.imagen } } });
    await runVegaTurn(turn(first, [{ role: "user", parts: [{ text: "x" }] }], "Logo de Sonríe, minimalista, cuadrada"), () => undefined);
    expect(runVegaTool).toHaveBeenCalledTimes(1);
    expect(chargeCredits).toHaveBeenCalledTimes(1);
  });

  it("en una rutina guardada Vega decide, pero con supuestos", async () => {
    runVegaTool.mockResolvedValue({ kind: "result", status: "Listo", response: { ok: true } });
    openVegaStream.mockResolvedValueOnce(stream({ text: "Listo." }));
    const contents: GeminiContent[] = [{ role: "user", parts: [{ text: "x" }] }];
    const first = stream({ functionCall: { name: "crear_imagen", args: { descripcion: "post del lunes", supuestos: "Estilo colorido, cuadrada" } } });
    await runVegaTurn(turn(first, contents, "post del lunes", "routine"), () => undefined);
    expect(runVegaTool).toHaveBeenCalledTimes(1);
    const response = contents.find((content, index) => index > 0 && content.role === "user")!.parts[0].functionResponse!.response;
    expect(response).toHaveProperty("supuestos");
  });
});

describe("briefing en el generador v2", () => {
  it("las respuestas del socio llegan al encargo del generador", () => {
    const brief = briefFromDelivery({ brief: "Landing", briefing: full.sitio, supuestos: "Estilo elegante" }, { title: "Sonríe" });
    expect(brief).toContain("Respuestas del socio al briefing:");
    expect(brief).toContain("- negocio: Sonríe Pachuca, clínica dental");
    expect(brief).toContain("Supuestos de Vega");
  });
});
