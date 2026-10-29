import { downloadHiggsfieldImage, readHiggsfieldImageStatus } from "@/lib/ai/higgsfield-image";
import { getPrisma } from "@/lib/prisma";
import { actionView } from "@/lib/vega/decide";
import type { VegaActionView } from "@/lib/vega/events";
import type { ImageDraft } from "@/lib/vega/tools";

const terminalStatuses = new Set(["failed", "nsfw", "canceled"]);

export async function advanceVegaImage(userId: string, actionId: string): Promise<VegaActionView | null> {
  const prisma = getPrisma();
  const action = await prisma.vegaAction.findFirst({
    where: { id: actionId, userId, kind: "create_image" },
    select: { id: true, kind: true, payload: true, status: true, result: true },
  });
  if (!action) return null;
  if (action.status !== "running") return actionView(action);

  const draft = action.payload as ImageDraft;
  if (!draft.requestId || !draft.statusUrl) {
    const updated = await prisma.vegaAction.updateMany({
      where: { id: action.id, userId, status: "running" },
      data: { status: "failed", result: "No encontramos la solicitud de Higgsfield para esta imagen." },
    });
    if (updated.count === 0) return advanceVegaImage(userId, action.id);
    return actionView({
      ...action,
      status: "failed",
      result: "No encontramos la solicitud de Higgsfield para esta imagen.",
    });
  }

  const status = await readHiggsfieldImageStatus({
    requestId: draft.requestId,
    statusUrl: draft.statusUrl,
  });
  if (!status.ok) {
    const updated = await prisma.vegaAction.updateMany({
      where: { id: action.id, userId, status: "running" },
      data: { status: "failed", result: status.error },
    });
    if (updated.count === 0) return advanceVegaImage(userId, action.id);
    return actionView({ ...action, status: "failed", result: status.error });
  }

  if (status.status !== "completed" && !terminalStatuses.has(status.status)) {
    return actionView(action);
  }

  if (status.status !== "completed" || !status.imageUrl) {
    const error = status.error ?? `Higgsfield no pudo generar la imagen (${status.status}).`;
    const updated = await prisma.vegaAction.updateMany({
      where: { id: action.id, userId, status: "running" },
      data: { status: "failed", result: error },
    });
    if (updated.count === 0) return advanceVegaImage(userId, action.id);
    return actionView({ ...action, status: "failed", result: error });
  }

  const image = await downloadHiggsfieldImage(status.imageUrl);
  if (!image.ok) {
    const updated = await prisma.vegaAction.updateMany({
      where: { id: action.id, userId, status: "running" },
      data: { status: "failed", result: image.error },
    });
    if (updated.count === 0) return advanceVegaImage(userId, action.id);
    return actionView({ ...action, status: "failed", result: image.error });
  }

  const completedPayload: ImageDraft = {
    prompt: draft.prompt,
    ...(draft.size ? { size: draft.size } : {}),
    dataUrl: image.dataUrl,
  };
  const updated = await prisma.vegaAction.updateMany({
    where: { id: action.id, userId, status: "running" },
    data: {
      status: "done",
      result: image.note,
      payload: completedPayload,
    },
  });
  if (updated.count === 0) return advanceVegaImage(userId, action.id);
  return actionView({
    ...action,
    payload: completedPayload,
    status: "done",
    result: image.note,
  });
}
