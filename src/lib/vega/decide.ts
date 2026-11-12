import { getPrisma } from "@/lib/prisma";
import { expireStaleActions, isExpired, sendRateLimit } from "@/lib/vega/action-store";
import type { VegaActionView } from "@/lib/vega/events";
import { classifyAction } from "@/lib/vega/policy";
import { executeVegaAction, type ActionKind, type ActionPayload } from "@/lib/vega/tools";

type ActionRow = {
  id: string;
  kind: string;
  payload: unknown;
  status: string;
  result: string | null;
  riskClass?: string | null;
  tainted?: boolean | null;
  expiresAt?: Date | null;
  createdAt?: Date | null;
};

export function actionView(action: ActionRow, now = new Date()): VegaActionView {
  const expired = isExpired(action, now);
  return {
    id: action.id,
    kind: action.kind as ActionKind,
    payload: action.payload as ActionPayload,
    status: expired ? "expired" : (action.status as VegaActionView["status"]),
    result: expired ? "Venció sin confirmación. No se envió nada." : action.result,
    ...(action.riskClass ? { risk: action.riskClass as VegaActionView["risk"] } : {}),
    ...(action.tainted ? { tainted: true } : {}),
  };
}

const select = { id: true, kind: true, payload: true, status: true, result: true, riskClass: true, tainted: true, expiresAt: true, createdAt: true } as const;

export type DecideResult = { ok: boolean; action?: VegaActionView; message: string; /** La acción sigue pendiente (p. ej. por límite de envíos). */ stillPending?: boolean };

/**
 * Confirma o cancela una acción pendiente del socio. Solo la primera decisión cuenta,
 * una acción vencida ya no se puede confirmar y una cancelada nunca se reintenta sola.
 */
export async function decideAction(userId: string, id: string, confirm: boolean, now = new Date()): Promise<DecideResult> {
  const prisma = getPrisma();
  await expireStaleActions(userId, now);
  const current = await prisma.vegaAction.findFirst({ where: { id, userId }, select: { ...select, conversationId: true } });
  if (!current) return { ok: false, message: "Esa acción ya no existe." };
  if (current.status === "expired") {
    return { ok: false, action: actionView(current, now), message: "Esa acción venció. Pídele a Vega que la prepare de nuevo si todavía la quieres." };
  }
  if (current.status !== "pending") return { ok: false, action: actionView(current, now), message: "Esa acción ya se había decidido." };

  const risk = current.riskClass ?? classifyAction(current.kind, current.payload);
  // El WhatsApp con enlace lo manda el socio desde su teléfono; el límite cuida lo que Vega envía por él.
  if (confirm && risk === "send" && current.kind !== "whatsapp_message") {
    const rate = await sendRateLimit(userId, now);
    if (!rate.ok) return { ok: false, action: actionView(current, now), message: rate.message, stillPending: true };
  }

  const claimed = await prisma.vegaAction.updateMany({
    where: { id, userId, status: "pending" },
    data: {
      status: confirm ? "running" : "cancelled",
      decidedAt: now,
      executedBy: "user",
      riskClass: risk,
      ...(confirm ? {} : { result: "Cancelado por el socio. Vega no lo volverá a intentar por su cuenta." }),
    },
  });
  if (claimed.count === 0) {
    const latest = await prisma.vegaAction.findFirst({ where: { id, userId }, select });
    return { ok: false, action: latest ? actionView(latest, now) : undefined, message: "Esa acción ya se había decidido." };
  }
  if (!confirm) {
    const cancelled = await prisma.vegaAction.findFirst({ where: { id, userId }, select });
    return { ok: true, action: cancelled ? actionView(cancelled, now) : undefined, message: "Cancelado. No se envió nada." };
  }

  const outcome = await executeVegaAction(userId, current.kind as ActionKind, current.payload as unknown as ActionPayload).catch(() => ({
    ok: false as const,
    message: "El servicio no respondió. No se completó la acción.",
  }));
  const updated = await prisma.vegaAction.update({
    where: { id },
    data: { status: outcome.ok ? "done" : "failed", result: outcome.message },
    select,
  });
  if (current.kind !== "whatsapp_message") {
    await prisma.vegaMessage.create({
      data: { conversationId: current.conversationId, role: "assistant", content: outcome.message, meta: { actionResult: id } },
    });
  }
  return { ok: outcome.ok, action: actionView(updated, now), message: outcome.message };
}
