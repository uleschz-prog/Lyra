import { describe, expect, it, vi } from "vitest";

import { estimateImageCostUsd, imageModel, imageProvider, imageSettings, imagesEnabled } from "@/lib/vega/images/config";
import { startImageFromDelivery, turnImageInputs } from "@/lib/vega/images/delivery";
import { classifyImageError, friendlyImageError, ImageProviderError, retryable } from "@/lib/vega/images/errors";
import { buildImagePrompt, missingLines, textLines } from "@/lib/vega/images/prompt";
import { createGatewayImageProvider, gatewayCost } from "@/lib/vega/images/providers/gateway";
import { selectImageProvider } from "@/lib/vega/images/providers";
import { createOpenAIImageProvider } from "@/lib/vega/images/providers/openai";
import type { ImageProvider, ImageRequest } from "@/lib/vega/images/providers/types";
import { advanceImageGeneration, getImageForUser, type ImagesDb, monthSpendUsd, readImageFile, startImageGeneration } from "@/lib/vega/images/runner";
import type { ImageStore } from "@/lib/vega/images/storage";
import { imageToolDeclaration, parseImageArgs } from "@/lib/vega/images/tool";
import { classifyAction, classifyTool } from "@/lib/vega/policy";
import { table } from "./fake-prisma";

const env = { AI_GATEWAY_API_KEY: "gw-test", BLOB_READ_WRITE_TOKEN: "blob-test" };
const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
const now = () => new Date("2026-11-25T18:00:00Z");
const silent = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function request(overrides: Partial<ImageRequest> = {}): ImageRequest {
  return { prompt: "Flyer", aspect: "2:3", quality: "medium", references: [], abortSignal: new AbortController().signal, ...overrides };
}

function setup(options: { env?: Record<string, string>; provider?: ImageProvider | null; balance?: number } = {}) {
  const vegaImageGeneration = table(
    () => ({
      conversationId: null,
      exactText: null,
      status: "queued",
      attempts: 0,
      errorKind: null,
      error: null,
      chargeId: null,
      refunded: false,
      estimatedCostUsd: 0,
      costUsd: null,
      blobUrl: null,
      mediaType: null,
      referenceUrls: [],
      textCheck: null,
      lockedUntil: null,
    }),
    { unique: ["actionId"] },
  );
  const vegaAction = table();
  const db = { vegaImageGeneration, vegaAction } as unknown as ImagesDb;
  const blobs = new Map<string, { data: Uint8Array; contentType: string }>();
  const store: ImageStore = {
    put: vi.fn(async (pathname: string, data: Uint8Array, contentType: string) => {
      const url = `https://abc.private.blob.vercel-storage.com/${pathname}`;
      blobs.set(url, { data, contentType });
      return url;
    }),
    get: vi.fn(async (url: string) => blobs.get(url) ?? null),
  };
  let balance = options.balance ?? 100;
  const charges: { key: string; amount: number }[] = [];
  const charge = vi.fn(async (_userId: string, amount: number, _description: string, key: string) => {
    if (charges.some((item) => item.key === key)) return { ok: true as const, chargeId: `tx-${key}`, duplicate: true };
    if (amount > balance) return { ok: false as const, error: "No tienes créditos suficientes." };
    balance -= amount;
    charges.push({ key, amount });
    return { ok: true as const, chargeId: `tx-${key}`, duplicate: false };
  });
  const refund = vi.fn(async () => {});
  const provider: ImageProvider =
    options.provider === null
      ? (null as unknown as ImageProvider)
      : options.provider ?? {
          id: "gateway",
          model: "openai/gpt-image-2",
          generate: vi.fn(async () => ({ data: png, mediaType: "image/png", model: "openai/gpt-image-2", costUsd: 0.041, inputTokens: 120, outputTokens: 1300 })),
        };
  const deps = { db, env: { ...env, ...options.env }, now, provider, store, charge, refund, log: silent };
  return { db, vegaImageGeneration, vegaAction, store, blobs, charge, refund, provider, deps, balance: () => balance };
}

async function start(ctx: ReturnType<typeof setup>, actionId = "act1", extra: Partial<Parameters<typeof startImageGeneration>[0]> = {}) {
  await ctx.vegaAction.create({ data: { id: actionId, userId: "u1", kind: "image_generation", status: "running", payload: { description: "Flyer" } } });
  return startImageGeneration(
    { user: { id: "u1" }, conversationId: "c1", actionId, description: "Flyer de cafetería, tonos cálidos", exactText: "GRAN APERTURA\nSábado 6 · 10:00", aspect: "2:3", ...extra },
    ctx.deps,
  );
}

describe("configuración de imágenes", () => {
  it("usa el Gateway por defecto y solo se activa con Blob", () => {
    expect(imageProvider(env)).toBe("gateway");
    expect(imageModel("gateway", env)).toBe("openai/gpt-image-2");
    expect(imagesEnabled(env)).toBe(true);
    expect(imagesEnabled({ AI_GATEWAY_API_KEY: "x" })).toBe(false);
    expect(imageProvider({ ...env, VEGA_IMAGE_PROVIDER: "off" })).toBeNull();
    expect(imageProvider({ BLOB_READ_WRITE_TOKEN: "b" })).toBeNull();
  });

  it("openai directo exige su llave y quita el prefijo del modelo", () => {
    expect(imageProvider({ VEGA_IMAGE_PROVIDER: "openai" })).toBeNull();
    const openai = { VEGA_IMAGE_PROVIDER: "openai", OPENAI_API_KEY: "sk-test", VEGA_IMAGE_MODEL: "openai/gpt-image-2" };
    expect(imageProvider(openai)).toBe("openai");
    expect(imageModel("openai", openai)).toBe("gpt-image-2");
    expect(selectImageProvider(openai)?.id).toBe("openai");
    expect(selectImageProvider(env)?.id).toBe("gateway");
  });

  it("estima con la tabla publicada de gpt-image-2 y usa el respaldo para otros modelos", () => {
    expect(estimateImageCostUsd("openai/gpt-image-2", "1:1", "medium")).toBeCloseTo(0.063);
    expect(estimateImageCostUsd("openai/gpt-image-2", "2:3", "high")).toBeCloseTo(0.175);
    expect(estimateImageCostUsd("bfl/flux-3-image", "1:1", "medium", { VEGA_IMAGE_EST_COST_USD: "0.05" })).toBe(0.05);
    expect(imageSettings({}).priceCredits).toBe(2);
    expect(imageSettings({ VEGA_IMAGE_TIMEOUT_MS: "999999" }).timeoutMs).toBe(55_000);
  });
});

describe("prompt con texto literal", () => {
  it("pone cada línea entre comillas con la orden de copiarla letra por letra", () => {
    const prompt = buildImagePrompt({ description: "Flyer de panadería", exactText: "¡Pan de muerto!\n2×1 · Año 2026", aspect: "2:3" });
    expect(prompt).toContain('"¡Pan de muerto!"');
    expect(prompt).toContain('"2×1 · Año 2026"');
    expect(prompt).toMatch(/acentos/i);
    expect(prompt).toMatch(/vertical/i);
  });

  it("sin texto pide una imagen sin letras y escapa comillas", () => {
    expect(buildImagePrompt({ description: "Foto de café", aspect: "1:1" })).toMatch(/sin texto|ningún texto|no incluyas texto/i);
    expect(buildImagePrompt({ description: "x", exactText: 'Dijo "hola"', aspect: "1:1" })).not.toContain('"hola"');
    expect(textLines("a\n\n b \n")).toEqual(["a", "b"]);
  });

  it("detecta líneas faltantes sin importar mayúsculas ni puntuación", () => {
    expect(missingLines("GRAN APERTURA\nSábado 6", "gran apertura — SÁBADO 6!")).toEqual([]);
    expect(missingLines("GRAN APERTURA\nSábado 6", "GRAN APERTURA Sabado 6")).toEqual(["Sábado 6"]);
  });
});

describe("errores del proveedor", () => {
  it.each([
    [{ name: "TimeoutError" }, "timeout"],
    [Object.assign(new Error("Your request was rejected by the safety system"), { statusCode: 400 }), "policy"],
    [Object.assign(new Error("moderation_blocked"), { statusCode: 400 }), "policy"],
    [Object.assign(new Error("slow down"), { statusCode: 429, type: "rate_limit_exceeded" }), "rate_limit"],
    [Object.assign(new Error("insufficient_quota"), { statusCode: 429 }), "quota"],
    [Object.assign(new Error("bad key"), { statusCode: 401 }), "auth"],
    [Object.assign(new Error("bad size"), { statusCode: 400 }), "invalid"],
    [Object.assign(new Error("boom"), { statusCode: 500 }), "provider"],
  ])("clasifica %o como %s", (error, kind) => {
    expect(classifyImageError(error).kind).toBe(kind);
  });

  it("los mensajes son en español y no se reintentan las reglas de contenido", () => {
    expect(friendlyImageError("policy")).toMatch(/reglas de contenido/);
    expect(retryable("policy")).toBe(false);
    expect(retryable("timeout")).toBe(true);
    expect(classifyImageError(new Error("x".repeat(2000))).detail.length).toBeLessThanOrEqual(400);
  });
});

describe("proveedor Gateway (AI SDK simulado)", () => {
  const image = { uint8Array: png, mediaType: "image/png", base64: "" };

  it("gpt-image usa size + calidad y lee el costo del Gateway", async () => {
    const generateImage = vi.fn(async () => ({ images: [image], responses: [{ modelId: "gpt-image-2" }], providerMetadata: { gateway: { cost: "0.041" } }, usage: { inputTokens: 10, outputTokens: 20 } }));
    const provider = createGatewayImageProvider("openai/gpt-image-2", { generateImage: generateImage as never });
    const result = await provider.generate(request());
    const args = (generateImage.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(args).toMatchObject({ model: "openai/gpt-image-2", size: "1024x1536", providerOptions: { openai: { quality: "medium" } }, maxRetries: 0 });
    expect(args.aspectRatio).toBeUndefined();
    expect(result).toMatchObject({ mediaType: "image/png", costUsd: 0.041, inputTokens: 10, outputTokens: 20 });
  });

  it("otros modelos usan aspectRatio y las referencias van en el prompt", async () => {
    const generateImage = vi.fn(async () => ({ images: [image], responses: [] }));
    const provider = createGatewayImageProvider("bfl/flux-3-image", { generateImage: generateImage as never });
    await provider.generate(request({ aspect: "3:2", references: [{ data: png, mediaType: "image/png" }] }));
    const args = (generateImage.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(args).toMatchObject({ aspectRatio: "3:2", prompt: { text: "Flyer", images: [png] } });
    expect(args.size).toBeUndefined();
  });

  it("Gemini genera con generateText y toma la imagen de files", async () => {
    const generateText = vi.fn(async () => ({ files: [{ uint8Array: png, mediaType: "image/png" }], response: { modelId: "gemini" }, usage: {}, providerMetadata: {} }));
    const provider = createGatewayImageProvider("google/gemini-3.1-flash-image", { generateText: generateText as never });
    const result = await provider.generate(request({ aspect: "1:1" }));
    const args = (generateText.mock.calls[0] as unknown[])[0] as { providerOptions: unknown };
    expect(args.providerOptions).toEqual({ google: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1" } } });
    expect(result.data).toBe(png);
  });

  it("sin imagen lanza «empty» y el costo ausente es null", async () => {
    const provider = createGatewayImageProvider("openai/gpt-image-2", { generateImage: (async () => ({ images: [], responses: [] })) as never });
    await expect(provider.generate(request())).rejects.toMatchObject({ kind: "empty" });
    expect(gatewayCost(undefined)).toBeNull();
  });
});

describe("proveedor OpenAI directo (fetch simulado)", () => {
  it("genera sin referencias por JSON", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(png).toString("base64") }], usage: { input_tokens: 5, output_tokens: 6 } })));
    const provider = createOpenAIImageProvider("gpt-image-2", "sk-test", fetcher as never);
    const result = await provider.generate(request({ quality: "high" }));
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "gpt-image-2", size: "1024x1536", quality: "high", n: 1 });
    expect(Array.from(result.data)).toEqual(Array.from(png));
  });

  it("con referencias usa /edits y propaga el status del error", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { code: "moderation_blocked", message: "safety system" } }), { status: 400 }));
    const provider = createOpenAIImageProvider("gpt-image-2", "sk-test", fetcher as never);
    const error = await provider.generate(request({ references: [{ data: png, mediaType: "image/png" }] })).catch((caught: unknown) => caught);
    expect((fetcher.mock.calls[0] as unknown as [string])[0]).toBe("https://api.openai.com/v1/images/edits");
    expect(classifyImageError(error).kind).toBe("policy");
  });
});

describe("herramienta generar_imagen", () => {
  it("valida argumentos y referencias", () => {
    const parsed = parseImageArgs({ descripcion: "Flyer de cafetería con tonos cálidos", texto_exacto: " GRAN APERTURA ", formato: "2:3", referencias: ["adjunto:1"] });
    expect(parsed).toEqual({ ok: true, draft: { description: "Flyer de cafetería con tonos cálidos", exactText: "GRAN APERTURA", aspectRatio: "2:3", references: ["adjunto:1"] } });
    expect(parseImageArgs({ descripcion: "x", formato: "1:1" }).ok).toBe(false);
    expect(parseImageArgs({ descripcion: "Flyer de cafetería", formato: "1:1", referencias: ["https://evil"] }).ok).toBe(false);
    expect(parseImageArgs({ descripcion: "Flyer de cafetería", formato: "1:1", texto_exacto: "x".repeat(401) }).ok).toBe(false);
  });

  it("anuncia el precio y es interna (la cobra su propio flujo)", () => {
    expect(imageToolDeclaration({ VEGA_IMAGE_PRICE_CREDITS: "3" }).description).toContain("3 créditos");
    expect(classifyTool("generar_imagen")).toBe("internal");
    expect(classifyAction("image_generation", {})).toBe("internal");
  });
});

describe("generación: cobro, topes y reembolso", () => {
  it("cobra, genera, guarda en Blob y actualiza la tarjeta", async () => {
    const ctx = setup();
    const started = await start(ctx);
    expect(started).toMatchObject({ ok: true, duplicate: false, image: { status: "queued", credits: 2 } });
    expect(ctx.balance()).toBe(98);
    const id = started.ok ? started.image.id : "";
    const view = await advanceImageGeneration(id, ctx.deps);
    expect(view).toMatchObject({ status: "done", url: `/api/vega/images/${id}/file`, error: null });
    const row = ctx.vegaImageGeneration.rows[0];
    expect(row).toMatchObject({ costUsd: 0.041, servedModel: "openai/gpt-image-2", bytes: png.byteLength, mediaType: "image/png" });
    expect(String(row.blobUrl)).toContain(`/vega-imagenes/u1/${id}.png`);
    const prompt = ((ctx.provider.generate as ReturnType<typeof vi.fn>).mock.calls[0][0] as ImageRequest).prompt;
    expect(prompt).toContain('"GRAN APERTURA"');
    expect(ctx.vegaAction.rows[0]).toMatchObject({ status: "done", result: "Imagen lista" });
    expect((ctx.vegaAction.rows[0].payload as { image: { status: string } }).image.status).toBe("done");
    const file = await readImageFile(ctx.db, "u1", id, ctx.store);
    expect(file?.contentType).toBe("image/png");
    expect(await readImageFile(ctx.db, "otro", id, ctx.store)).toBeNull();
    expect(await getImageForUser(ctx.db, "otro", id)).toBeNull();
    // Idempotente: otra solicitud no vuelve a generar.
    await advanceImageGeneration(id, ctx.deps);
    expect(ctx.provider.generate).toHaveBeenCalledTimes(1);
  });

  it("la misma acción no cobra dos veces", async () => {
    const ctx = setup();
    await start(ctx);
    const again = await startImageGeneration({ user: { id: "u1" }, conversationId: "c1", actionId: "act1", description: "Flyer", aspect: "1:1" }, ctx.deps);
    expect(again).toMatchObject({ ok: true, duplicate: true });
    expect(ctx.charge).toHaveBeenCalledTimes(1);
  });

  it("respeta el límite por hora y el tope mensual global", async () => {
    const limited = setup({ env: { VEGA_IMAGE_PER_HOUR: "1" } });
    // El reloj de fake-prisma arranca el 1 de noviembre (UTC): «ahora» va en la misma hora.
    limited.deps.now = () => new Date(Date.parse("2026-11-01T00:30:00Z"));
    expect((await start(limited, "a1")).ok).toBe(true);
    expect(await start(limited, "a2")).toMatchObject({ ok: false, reason: "limit" });

    const capped = setup({ env: { VEGA_IMAGE_MONTHLY_CAP_USD: "0.05" } });
    expect(await start(capped)).toMatchObject({ ok: false, reason: "cap" });
    expect(capped.charge).not.toHaveBeenCalled();
  });

  it("sin créditos no crea nada", async () => {
    const ctx = setup({ balance: 1 });
    expect(await start(ctx)).toMatchObject({ ok: false, reason: "credits" });
    expect(ctx.vegaImageGeneration.rows).toHaveLength(0);
  });

  it("rechazo por contenido: falla sin reintento, mensaje amable y un solo reembolso", async () => {
    const generate = vi.fn(async () => {
      throw Object.assign(new Error("Your request was rejected as a result of our safety system"), { statusCode: 400 });
    });
    const ctx = setup({ provider: { id: "gateway", model: "openai/gpt-image-2", generate } });
    const started = await start(ctx);
    const id = started.ok ? started.image.id : "";
    const view = await advanceImageGeneration(id, ctx.deps);
    expect(view).toMatchObject({ status: "failed", refunded: true, error: friendlyImageError("policy") });
    await advanceImageGeneration(id, ctx.deps);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(ctx.refund).toHaveBeenCalledTimes(1);
    expect(ctx.vegaAction.rows[0].result).toMatch(/Te devolvimos los créditos/);
    // Las reembolsadas no cuentan para el tope.
    expect(await monthSpendUsd(ctx.db, now())).toBe(0);
  });

  it("un tiempo agotado se reintenta una vez y luego reembolsa", async () => {
    const generate = vi.fn(async () => {
      throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
    });
    const ctx = setup({ provider: { id: "gateway", model: "openai/gpt-image-2", generate } });
    const started = await start(ctx);
    const id = started.ok ? started.image.id : "";
    expect(await advanceImageGeneration(id, ctx.deps)).toMatchObject({ status: "queued" });
    expect(await advanceImageGeneration(id, ctx.deps)).toMatchObject({ status: "failed", error: friendlyImageError("timeout") });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(ctx.refund).toHaveBeenCalledTimes(1);
  });

  it("el revisor de texto marca las líneas que no salieron", async () => {
    const ctx = setup({ env: { VEGA_IMAGE_TEXT_CHECK: "on" } });
    const checkText = vi.fn(async () => ({ ok: false, missing: ["Sábado 6 · 10:00"], read: "GRAN APERTURA Sabado" }));
    const started = await start(ctx);
    const view = await advanceImageGeneration(started.ok ? started.image.id : "", { ...ctx.deps, checkText });
    expect(view).toMatchObject({ status: "done", missingText: ["Sábado 6 · 10:00"] });
    expect(ctx.vegaAction.rows[0].result).toBe("Imagen lista (revisa el texto)");
  });

  it("las referencias del mensaje se guardan y llegan al proveedor", async () => {
    const ctx = setup();
    await ctx.vegaAction.create({ data: { id: "act9", userId: "u1", kind: "image_generation", status: "running", payload: {} } });
    const inputs = turnImageInputs([{ inline: { mimeType: "image/png", data: Buffer.from(png).toString("base64") } }, { inline: { mimeType: "application/pdf", data: "x" } }]);
    expect(inputs).toHaveLength(1);
    const started = await startImageFromDelivery(
      { userId: "u1", chatId: "c1", actionId: "act9", draft: { description: "Flyer con mi logo", aspectRatio: "1:1", references: ["adjunto:1"] }, inputs },
      ctx.deps,
    );
    expect(started.ok).toBe(true);
    expect(started.response).toMatchObject({ estado: "generando" });
    await advanceImageGeneration(started.ok ? started.image.id : "", ctx.deps);
    const sent = (ctx.provider.generate as ReturnType<typeof vi.fn>).mock.calls[0][0] as ImageRequest;
    expect(sent.references).toHaveLength(1);

    const missing = await startImageFromDelivery(
      { userId: "u1", chatId: "c1", actionId: "act10", draft: { description: "Flyer", aspectRatio: "1:1", references: ["adjunto:2"] }, inputs },
      ctx.deps,
    );
    expect(missing).toMatchObject({ ok: false });
  });

  it("si no hay proveedor configurado, falla con reembolso en vez de colgarse", async () => {
    const ctx = setup({ provider: null });
    const started = await start(ctx);
    expect(await advanceImageGeneration(started.ok ? started.image.id : "", ctx.deps)).toMatchObject({ status: "failed", refunded: true });
    expect(ImageProviderError).toBeDefined();
  });
});
