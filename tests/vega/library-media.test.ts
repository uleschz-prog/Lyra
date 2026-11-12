import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
  readVideo: vi.fn(),
  saveCreation: vi.fn(),
  actionUpdateMany: vi.fn(),
  mediaCreate: vi.fn(),
  actionUpdate: vi.fn(),
  actionFind: vi.fn(),
  mediaFind: vi.fn(),
  mediaUpdateMany: vi.fn(),
  mediaFindOrThrow: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ put: mocks.put }));
vi.mock("@/lib/ai/media", () => ({ readOpenRouterVideo: mocks.readVideo }));
vi.mock("@/lib/media-pieces", () => ({ saveCreationForUser: mocks.saveCreation }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    $transaction: mocks.transaction,
    mediaPiece: {
      findFirst: mocks.mediaFind,
      updateMany: mocks.mediaUpdateMany,
      findFirstOrThrow: mocks.mediaFindOrThrow,
    },
  }),
}));

import {
  saveVegaImageActionToLibrary,
  saveVegaVideoBytesToLibrary,
  saveVegaVideoToLibrary,
} from "@/lib/vega/library-media";

describe("persistencia de medios de Vega", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("guarda la imagen y la acción de forma transaccional con una ruta privada", async () => {
    const tx = {
      vegaAction: { updateMany: mocks.actionUpdateMany, update: mocks.actionUpdate, findFirstOrThrow: mocks.actionFind },
      mediaPiece: { create: mocks.mediaCreate, findFirst: mocks.mediaFind },
    };
    mocks.put.mockResolvedValue({ url: "https://abc.private.blob.vercel-storage.com/image.jpg" });
    mocks.transaction.mockImplementation((callback: (transaction: typeof tx) => unknown) => callback(tx));
    mocks.actionUpdateMany.mockResolvedValue({ count: 1 });
    mocks.mediaCreate.mockResolvedValue({ id: "piece-1" });
    mocks.actionFind.mockResolvedValue({
      id: "action-1",
      kind: "create_image",
      payload: { prompt: "Flyer" , imageUrl: "/api/library/image?pieceId=piece-1" },
      status: "done",
      result: "Generada",
    });

    await expect(saveVegaImageActionToLibrary({
      userId: "user-1",
      actionId: "action-1",
      prompt: "Flyer",
      dataUrl: "data:image/jpeg;base64,YQ==",
      payload: { prompt: "Flyer" },
      result: "Generada",
    })).resolves.toMatchObject({
      status: "done",
      payload: { imageUrl: "/api/library/image?pieceId=piece-1" },
    });

    expect(mocks.mediaCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        area: "studio",
        kind: "image",
        media: "https://abc.private.blob.vercel-storage.com/image.jpg",
      }),
      select: { id: true },
    });
    expect(mocks.actionUpdate).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: { payload: expect.objectContaining({ imageUrl: "/api/library/image?pieceId=piece-1" }) },
    });
  });

  it("asocia el video subido al usuario y a la pieza indicada", async () => {
    mocks.put.mockResolvedValue({ url: "https://abc.private.blob.vercel-storage.com/video.webm" });
    mocks.mediaFind.mockResolvedValue({ id: "piece-2" });
    mocks.mediaUpdateMany.mockResolvedValue({ count: 1 });
    mocks.mediaFindOrThrow.mockResolvedValue({ id: "piece-2", createdAt: new Date("2026-01-01T00:00:00.000Z") });

    await expect(saveVegaVideoBytesToLibrary(
      "user-1",
      "Video de prueba",
      "Guion de prueba",
      new Uint8Array([1, 2, 3]),
      "video/webm",
      "piece-2",
    )).resolves.toMatchObject({
      id: "piece-2",
      media: "https://abc.private.blob.vercel-storage.com/video.webm",
    });

    expect(mocks.mediaUpdateMany).toHaveBeenCalledWith({
      where: { id: "piece-2", userId: "user-1", kind: "video", area: "studio" },
      data: { media: "https://abc.private.blob.vercel-storage.com/video.webm" },
    });
  });

  it("descarga y guarda en privado un video generado por OpenRouter", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    mocks.readVideo.mockResolvedValue({
      ok: true,
      status: "completed",
      body,
      contentType: "video/mp4",
    });
    mocks.put.mockResolvedValue({ url: "https://abc.private.blob.vercel-storage.com/generated.mp4" });
    mocks.saveCreation.mockResolvedValue({ id: "piece-3", createdAt: "2026-01-01T00:00:00.000Z" });

    await expect(saveVegaVideoToLibrary("user-1", {
      title: "Video de Vega",
      script: "Guion del video",
      scenes: ["Escena"],
      html: "<p>Escena</p>",
      videoUrl: "/api/ai/video?jobId=job-123&play=1",
      files: [],
    })).resolves.toMatchObject({
      id: "piece-3",
      media: "https://abc.private.blob.vercel-storage.com/generated.mp4",
    });

    expect(mocks.saveCreation).toHaveBeenCalledWith("user-1", expect.objectContaining({
      area: "studio",
      kind: "video",
      title: "Video de Vega",
      media: "https://abc.private.blob.vercel-storage.com/generated.mp4",
    }));
    expect(mocks.put).toHaveBeenCalledWith(
      expect.stringMatching(/^lyra-vega\/user-1\/videos\/.+\.mp4$/),
      expect.any(Buffer),
      { access: "private", contentType: "video/mp4" },
    );
  });
});
