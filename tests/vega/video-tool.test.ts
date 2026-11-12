import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/vega/library-media", () => ({ saveVegaVideoToLibrary: vi.fn() }));

import { runCreateVideo, videoQuotaExhaustedMessage, type VideoToolDeps } from "@/lib/vega/video-tool";

function deps(overrides: Partial<VideoToolDeps> = {}) {
  const base: VideoToolDeps = {
    reserve: vi.fn(async (_userId: string, seconds: number) => ({ cycleId: "c1", seconds })),
    release: vi.fn(async () => undefined),
    clip: vi.fn(async () => ({ ok: true as const, url: "https://cdn.runwayml.com/v.mp4", note: "" })),
    save: vi.fn(async () => ({ id: "piece-1", media: "blob" })),
    clipSeconds: () => 5,
  };
  return { ...base, ...overrides };
}

const input = { title: "Anuncio", script: "Abre tu agenda hoy.", format: "9:16" };

describe("crear_video con cuota del plan", () => {
  it("sin cuota no llama al proveedor", async () => {
    const d = deps({ reserve: vi.fn(async () => null) });
    const result = await runCreateVideo("u1", input, d);
    expect(result).toEqual({ ok: false, error: videoQuotaExhaustedMessage });
    expect(d.clip).not.toHaveBeenCalled();
  });

  it("descuenta los segundos del clip y guarda en Biblioteca", async () => {
    const d = deps();
    const result = await runCreateVideo("u1", input, d);
    expect(d.reserve).toHaveBeenCalledWith("u1", 5, expect.any(Date));
    expect(result).toMatchObject({ ok: true, seconds: 5, savedToLibrary: true, videoUrl: "/api/library/video?pieceId=piece-1" });
    expect(d.release).not.toHaveBeenCalled();
  });

  it("si el clip no sale devuelve la cuota y no entrega nada falso", async () => {
    const d = deps({ clip: vi.fn(async () => ({ ok: false as const, error: "El video tardó más de lo permitido y se canceló." })) });
    const result = await runCreateVideo("u1", input, d);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("No se descontó tu cuota");
    expect(d.release).toHaveBeenCalledWith("u1", { cycleId: "c1", seconds: 5 });
  });

  it("si el proveedor lanza un error también devuelve la cuota", async () => {
    const d = deps({ clip: vi.fn(async () => { throw new Error("red"); }) });
    const result = await runCreateVideo("u1", input, d);
    expect(result.ok).toBe(false);
    expect(d.release).toHaveBeenCalledTimes(1);
  });

  it("si Biblioteca falla entrega el clip real y la cuota queda usada", async () => {
    const d = deps({ save: vi.fn(async () => { throw new Error("blob"); }) });
    const result = await runCreateVideo("u1", input, d);
    expect(result).toMatchObject({ ok: true, savedToLibrary: false, videoUrl: "https://cdn.runwayml.com/v.mp4" });
    expect(d.release).not.toHaveBeenCalled();
  });
});
