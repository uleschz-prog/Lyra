import { getPrisma } from "@/lib/prisma";
import type { VegaActionView } from "@/lib/vega/events";
import { executeVegaAction, type ActionKind, type ActionPayload } from "@/lib/vega/tools";

export function actionView(action: { id: string; kind: string; payload: unknown; status: string; result: string | null }): VegaActionView {
  return {
    id: action.id,
    kind: action.kind as ActionKind,
    payload: action.payload as ActionPayload,
    status: action.status as VegaActionView["status"],
    result: action.result,
  };
}

/** Confirma o cancela una acción pendiente del socio. Solo la primera decisión cuenta. */
export async function decideAction(userId: string, id: string, confirm: boolean): Promise<{ ok: boolean; action?: VegaActionView; message: string }> {
  const prisma = getPrisma();
  const claimed = await prisma.vegaAction.updateMany({
    where: { id, userId, status: "pending" },
    data: { status: confirm ? "running" : "cancelled", ...(confirm ? {} : { result: "Cancelado por el socio." }) },
  });
  const action = await prisma.vegaAction.findFirst({
    where: { id, userId },
    select: { id: true, kind: true, payload: true, status: true, result: true, conversationId: true },
  });
  if (!action) return { ok: false, message: "Esa acción ya no existe." };
  if (claimed.count === 0) return { ok: false, action: actionView(action), message: "Esa acción ya se había decidido." };
  if (!confirm) return { ok: true, action: actionView(action), message: "Cancelado. No se envió nada." };

  const outcome = await executeVegaAction(userId, action.kind as ActionKind, action.payload as unknown as ActionPayload).catch(() => ({
    ok: false as const,
    message: "El servicio no respondió. No se completó la acción.",
  }));
  const updated = await prisma.vegaAction.update({
    where: { id },
    data: { status: outcome.ok ? "done" : "failed", result: outcome.message },
    select: { id: true, kind: true, payload: true, status: true, result: true },
  });
  if (action.kind !== "whatsapp_message") {
    await prisma.vegaMessage.create({
      data: { conversationId: action.conversationId, role: "assistant", content: outcome.message, meta: { actionResult: id } },
    });
  }
  return { ok: outcome.ok, action: actionView(updated), message: outcome.message };
}
