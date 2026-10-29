import { afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import sharp from "sharp";

import { generateStill, openRouterJob, openRouterVideoModel, runwayOutputUrl, runwayRatio } from "@/lib/ai/media";
import { higgsfieldImageAspectRatio, submitHiggsfieldImage } from "@/lib/ai/higgsfield-image";

const requestId = "3b241d00-0fb1-4fdb-b7ca-34f05a80a315";
const statusUrl = `https://api.higgsfield.ai/requests/${requestId}/status`;
const imageUrl = "https://cdn.higgsfield.ai/generated/image.png";

function acceptedRequest(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      request_id: requestId,
      status_url: statusUrl,
      ...overrides,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function completedStatus(overrides: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ status: "completed", images: [{ url: imageUrl }], ...overrides }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("generación de imagen y video", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("solicita y descarga una imagen desde Higgsfield", async () => {
    vi.stubEnv("HIGGSFIELD_API_KEY_ID", "image-test-id");
    vi.stubEnv("HIGGSFIELD_API_KEY_SECRET", "image-test-secret");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://api.higgsfield.ai/marketing-studio/image/flare") {
        expect(init?.method).toBe("POST");
        expect(new Headers(init?.headers).get("Authorization")).toBe("Key image-test-id:image-test-secret");
        expect(new Headers(init?.headers).get("Idempotency-Key")).toBeTruthy();
        expect(JSON.parse(String(init?.body))).toMatchObject({
          prompt: "Flyer para un concierto",
          resolution: "1k",
          aspect_ratio: "9:16",
          quality: "low",
          enhance_prompt: false,
        });
        return acceptedRequest();
      }
      if (url === statusUrl) {
        expect(new Headers(init?.headers).get("Authorization")).toBe("Key image-test-id:image-test-secret");
        return completedStatus();
      }
      if (url === imageUrl) {
        const image = await sharp({
          create: { width: 4, height: 4, channels: 3, background: { r: 120, g: 80, b: 200 } },
        })
          .png()
          .toBuffer();
        return new Response(image, {
          status: 200,
          headers: { "Content-Type": "image/png", "Content-Length": String(image.byteLength) },
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateStill("Flyer para un concierto", "vertical");

    expect(result).toMatchObject({ ok: true, note: "Imagen generada con Higgsfield Marketing Studio." });
    expect(result.ok && result.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("deja el trabajo en segundo plano para que Vega no bloquee el chat", async () => {
    vi.stubEnv("HIGGSFIELD_API_KEY_ID", "image-test-id");
    vi.stubEnv("HIGGSFIELD_API_KEY_SECRET", "image-test-secret");
    const fetchMock = vi.fn().mockResolvedValue(acceptedRequest());
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitHiggsfieldImage("Flyer para un concierto", "vertical")).resolves.toEqual({
      ok: true,
      submission: { requestId, statusUrl },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falla claramente si las credenciales de Higgsfield no están configuradas", async () => {
    vi.stubEnv("HIGGSFIELD_API_KEY_ID", "");
    vi.stubEnv("HIGGSFIELD_API_KEY_SECRET", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateStill("Una imagen")).resolves.toEqual({
      ok: false,
      error: "Higgsfield no está configurado en el servidor.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rechaza una URL de estado que no pertenece a la solicitud de Higgsfield", async () => {
    vi.stubEnv("HIGGSFIELD_API_KEY_ID", "image-test-id");
    vi.stubEnv("HIGGSFIELD_API_KEY_SECRET", "image-test-secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(acceptedRequest({ status_url: "https://attacker.example/status" })));

    const result = await generateStill("Una imagen");

    expect(result).toMatchObject({ ok: false, error: "Higgsfield no aceptó la solicitud de imagen." });
  });

  it("devuelve el error cuando Higgsfield marca la generación como fallida", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("HIGGSFIELD_API_KEY_ID", "image-test-id");
    vi.stubEnv("HIGGSFIELD_API_KEY_SECRET", "image-test-secret");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "https://api.higgsfield.ai/marketing-studio/image/flare"
        ? acceptedRequest()
        : new Response(JSON.stringify({ status: "failed", error: { message: "Generation failed" } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateStill("Una imagen");

    expect(result).toMatchObject({ ok: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rechaza respuestas de descarga que no sean imágenes compatibles", async () => {
    vi.stubEnv("HIGGSFIELD_API_KEY_ID", "image-test-id");
    vi.stubEnv("HIGGSFIELD_API_KEY_SECRET", "image-test-secret");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://api.higgsfield.ai/marketing-studio/image/flare") return acceptedRequest();
      if (url === statusUrl) return completedStatus();
      return new Response("<html>not an image</html>", { status: 200, headers: { "Content-Type": "text/html" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateStill("Una imagen");

    expect(result).toMatchObject({
      ok: false,
      error: "Higgsfield no entregó un archivo de imagen compatible.",
    });
  });

  it("rechaza archivos fuente que exceden el límite de descarga", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("HIGGSFIELD_API_KEY_ID", "image-test-id");
    vi.stubEnv("HIGGSFIELD_API_KEY_SECRET", "image-test-secret");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://api.higgsfield.ai/marketing-studio/image/flare") return acceptedRequest();
      if (url === statusUrl) return completedStatus();
      return new Response(new Uint8Array([0]), {
        status: 200,
        headers: { "Content-Type": "image/png", "Content-Length": String(12 * 1024 * 1024 + 1) },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateStill("Una imagen");

    expect(result).toMatchObject({
      ok: false,
      error: "La imagen generada supera el límite de descarga.",
    });
  });

  it("optimiza imágenes grandes para poder guardarlas en la biblioteca", async () => {
    vi.stubEnv("HIGGSFIELD_API_KEY_ID", "image-test-id");
    vi.stubEnv("HIGGSFIELD_API_KEY_SECRET", "image-test-secret");
    const pixels = randomBytes(1200 * 1200 * 3);
    const source = await sharp(pixels, { raw: { width: 1200, height: 1200, channels: 3 } }).png().toBuffer();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://api.higgsfield.ai/marketing-studio/image/flare") return acceptedRequest();
      if (url === statusUrl) return completedStatus();
      return new Response(source, {
        status: 200,
        headers: { "Content-Type": "image/png", "Content-Length": String(source.byteLength) },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateStill("Una imagen");

    expect(result.ok).toBe(true);
    expect(result.ok && result.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(result.ok && result.dataUrl.length).toBeLessThan(1_900_000);
  });

  it("traduce orientaciones para imagen y video", () => {
    expect(higgsfieldImageAspectRatio("horizontal")).toBe("16:9");
    expect(higgsfieldImageAspectRatio("vertical")).toBe("9:16");
    expect(higgsfieldImageAspectRatio("cuadrada")).toBe("1:1");
    expect(runwayRatio("9:16")).toBe("720:1280");
    expect(runwayRatio("1:1")).toBe("960:960");
    expect(runwayRatio("16:9")).toBe("1280:720");
  });

  it("lee el trabajo de video de OpenRouter y rechaza un id raro", () => {
    expect(openRouterVideoModel()).toBe("x-ai/grok-imagine-video-1.5-lite");
    expect(
      openRouterJob({
        id: "job-abc123",
        status: "completed",
        unsigned_urls: ["https://openrouter.ai/api/v1/videos/job-abc123/content"],
      })?.status,
    ).toBe("completed");
    expect(openRouterJob({ id: "../etc", status: "completed" })).toBeNull();
    expect(openRouterJob({ id: "job-abc123", status: "in_progress" })?.urls).toEqual([]);
  });

  it("lee la dirección del video cuando Runway termina", () => {
    expect(runwayOutputUrl({ output: ["https://cdn.example/video.mp4"] })).toBe("https://cdn.example/video.mp4");
    expect(runwayOutputUrl({ status: "RUNNING" })).toBeNull();
  });
});
