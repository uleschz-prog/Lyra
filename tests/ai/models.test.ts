import { describe, expect, it } from "vitest";

import { chatTier, defaultFuerte, defaultRapido, gatewayMode, geminiCredentials, orderForInputs, tierModels } from "@/lib/ai/models";

describe("modo de la capa de modelos", () => {
  it("sin clave ni bandera usa la ruta Gemini (producción no cambia)", () => {
    expect(gatewayMode({})).toEqual({ enabled: false });
    expect(gatewayMode({ GEMINI_API_KEY: "g" })).toEqual({ enabled: false });
  });

  it("con AI_GATEWAY_API_KEY usa el Gateway; VEGA_AI_GATEWAY=off lo apaga", () => {
    expect(gatewayMode({ AI_GATEWAY_API_KEY: " k " })).toEqual({ enabled: true, auth: "key", apiKey: "k" });
    expect(gatewayMode({ AI_GATEWAY_API_KEY: "k", VEGA_AI_GATEWAY: "off" })).toEqual({ enabled: false });
  });

  it("OIDC solo si se pide (VEGA_AI_GATEWAY=oidc u on)", () => {
    expect(gatewayMode({ VERCEL: "1" })).toEqual({ enabled: false });
    expect(gatewayMode({ VEGA_AI_GATEWAY: "oidc" })).toEqual({ enabled: true, auth: "oidc" });
    expect(gatewayMode({ VEGA_AI_GATEWAY: "on" })).toEqual({ enabled: true, auth: "oidc" });
  });

  it("respeta GEMINI_MODEL en la ruta anterior", () => {
    expect(geminiCredentials({ GEMINI_API_KEY: "g", GEMINI_MODEL: "gemini-3.5-flash-lite" })).toEqual({ apiKey: "g", model: "gemini-3.5-flash-lite" });
    expect(geminiCredentials({}).model).toBe("gemini-2.5-flash");
  });
});

describe("niveles fuerte y rápido", () => {
  it("por defecto: tres modelos de proveedores distintos en cada nivel", () => {
    expect(tierModels("fuerte", {})).toEqual(defaultFuerte);
    expect(tierModels("rapido", {})).toEqual(defaultRapido);
    for (const models of [defaultFuerte, defaultRapido]) expect(new Set(models.map((id) => id.split("/")[0])).size).toBe(3);
    expect(defaultFuerte[0]).toBe("anthropic/claude-sonnet-5.5");
    expect(defaultRapido[0]).toBe("anthropic/claude-haiku-5.5");
  });

  it("VEGA_MODEL_* cambia el principal y conserva los respaldos por defecto", () => {
    expect(tierModels("fuerte", { VEGA_MODEL_FUERTE: "anthropic/claude-opus-5.5" })).toEqual(["anthropic/claude-opus-5.5", ...defaultFuerte]);
    expect(tierModels("fuerte", { VEGA_MODEL_FUERTE: "spacexai/grok-4.7" })).toEqual(["spacexai/grok-4.7", "anthropic/claude-sonnet-5.5", "openai/gpt-5.6-terra"]);
  });

  it("una lista completa en VEGA_MODEL_RAPIDO reemplaza todo el nivel", () => {
    expect(tierModels("rapido", { VEGA_MODEL_RAPIDO: "openai/gpt-5.6-luna, google/gemini-3.8-flash" })).toEqual(["openai/gpt-5.6-luna", "google/gemini-3.8-flash"]);
  });

  it("respaldos por nivel y globales, sin duplicados ni ids inválidos", () => {
    const env = {
      VEGA_MODEL_FUERTE_FALLBACKS: "openai/gpt-5.6-terra,no-es-un-id,spacexai/grok-4.7",
      VEGA_MODEL_FALLBACKS: "google/gemini-3.8-flash",
    };
    expect(tierModels("fuerte", env)).toEqual(["anthropic/claude-sonnet-5.5", "openai/gpt-5.6-terra", "spacexai/grok-4.7", "google/gemini-3.8-flash"]);
    expect(tierModels("rapido", env)).toEqual([...defaultRapido, "google/gemini-3.8-flash"]);
    expect(tierModels("fuerte", { VEGA_MODEL_FUERTE_FALLBACKS: "" })).toEqual(["anthropic/claude-sonnet-5.5"]);
  });

  it("con PDF adjunto empieza por un modelo que lee PDF", () => {
    const grokFirst = ["spacexai/grok-4.7", "anthropic/claude-sonnet-5.5", "openai/gpt-5.6-terra"];
    expect(orderForInputs(grokFirst, true)).toEqual(["anthropic/claude-sonnet-5.5", "spacexai/grok-4.7", "openai/gpt-5.6-terra"]);
    expect(orderForInputs(defaultFuerte, false)).toEqual(defaultFuerte);
    expect(orderForInputs(defaultRapido, true)).toEqual(defaultRapido);
  });
});

describe("nivel del turno de chat", () => {
  it("rápido para mensajes cortos y sencillos", () => {
    expect(chatTier({ message: "hola, ¿cómo estás?" }, {})).toBe("rapido");
    expect(chatTier({ message: "gracias!" }, {})).toBe("rapido");
  });

  it("fuerte para crear, editar, adjuntos, mensajes largos, trabajos y rutinas", () => {
    expect(chatTier({ message: "créame una app para mi taller" }, {})).toBe("fuerte");
    expect(chatTier({ message: "haz un juego de naves" }, {})).toBe("fuerte");
    expect(chatTier({ message: "mira esto", attachments: 1 }, {})).toBe("fuerte");
    expect(chatTier({ message: "a".repeat(400) }, {})).toBe("fuerte");
    expect(chatTier({ message: "hola", source: "job" }, {})).toBe("fuerte");
    expect(chatTier({ message: "hola", source: "routine" }, {})).toBe("fuerte");
    expect(chatTier({ message: "hola", source: "whatsapp" }, {})).toBe("rapido");
  });

  it("VEGA_CHAT_TIER fuerza el nivel", () => {
    expect(chatTier({ message: "hola" }, { VEGA_CHAT_TIER: "fuerte" })).toBe("fuerte");
    expect(chatTier({ message: "créame una app" }, { VEGA_CHAT_TIER: "rapido" })).toBe("rapido");
  });
});

describe("nivel del generador", async () => {
  const { builderTier } = await import("@/lib/builder/model");
  it("fuerte por defecto; VEGA_BUILDER_TIER=rapido lo baja", () => {
    expect(builderTier({})).toBe("fuerte");
    expect(builderTier({ VEGA_BUILDER_TIER: "rapido" })).toBe("rapido");
  });
});
