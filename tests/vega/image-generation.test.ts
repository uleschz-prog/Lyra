import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  readStatus: vi.fn(),
  downloadImage: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({ vegaAction: { findFirst: mocks.findFirst, updateMany: mocks.updateMany } }),
}));

vi.mock("@/lib/ai/higgsfield-image", () => ({
  readHiggsfieldImageStatus: mocks.readStatus,
  downloadHiggsfieldImage: mocks.downloadImage,
}));

vi.mock("@/lib/vega/decide", () => ({
  actionView: (action: unknown) => action,
}));

import { advanceVegaImage } from "@/lib/vega/image-generation";

const action = {
  id: "action-id-12345",
  kind: "create_image",
  payload: {
    prompt: "Flyer para un concierto",
    size: "vertical",
    requestId: "3b241d00-0fb1-4fdb-b7ca-34f05a80a315",
    statusUrl: "https://api.higgsfield.ai/requests/3b241d00-0fb1-4fdb-b7ca-34f05a80a315/status",
  },
  status: "running",
  result: "Generando imagen",
};

describe("seguimiento de imágenes de Vega", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("deja en proceso una solicitud que Higgsfield todavía está generando", async () => {
    mocks.findFirst.mockResolvedValue(action);
    mocks.readStatus.mockResolvedValue({ ok: true, status: "in_progress" });

    await expect(advanceVegaImage("user-1", action.id)).resolves.toMatchObject({
      id: action.id,
      status: "running",
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.downloadImage).not.toHaveBeenCalled();
  });

  it("guarda la imagen al completarse y marca la acción como lista", async () => {
    mocks.findFirst.mockResolvedValue(action);
    mocks.readStatus.mockResolvedValue({
      ok: true,
      status: "completed",
      imageUrl: "https://cdn.higgsfield.ai/generated/image.png",
    });
    mocks.downloadImage.mockResolvedValue({
      ok: true,
      dataUrl: "data:image/jpeg;base64,abc",
      note: "Imagen generada con Higgsfield Marketing Studio.",
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await expect(advanceVegaImage("user-1", action.id)).resolves.toMatchObject({
      status: "done",
      payload: { prompt: "Flyer para un concierto", size: "vertical", dataUrl: "data:image/jpeg;base64,abc" },
    });
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: action.id, userId: "user-1", status: "running" },
        data: expect.objectContaining({ status: "done" }),
      }),
    );
  });

  it("marca la acción como fallida con el error de Higgsfield", async () => {
    mocks.findFirst.mockResolvedValue(action);
    mocks.readStatus.mockResolvedValue({ ok: true, status: "failed", error: "Generation failed" });
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await expect(advanceVegaImage("user-1", action.id)).resolves.toMatchObject({
      status: "failed",
      result: "Generation failed",
    });
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "failed", result: "Generation failed" } }),
    );
  });
});
