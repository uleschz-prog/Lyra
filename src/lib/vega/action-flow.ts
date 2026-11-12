import type { Prisma } from "@/generated/prisma/client";

import { getPrisma } from "@/lib/prisma";
import { expiryFrom, wasDeclined } from "@/lib/vega/action-store";
import { evaluateAutonomy, type AutonomyDecision } from "@/lib/vega/autonomy";
import { actionView } from "@/lib/vega/decide";
import type { VegaActionView } from "@/lib/vega/events";
import { actionFingerprint, asksToRetry, classifyAction, decideExecution } from "@/lib/vega/policy";
import { executeVegaAction, type ActionKind, type ActionPayload } from "@/lib/vega/tools";

export type ProposeInput = {
  userId: string;
  chatId: string;
  kind: ActionKind;
  payload: ActionPayload;
  /** En este turno Vega leyó contenido externo (correo, web, hojas…). */
  tainted: boolean;
  /** Último mensaje del socio, para saber si pidió explícitamente reintentar. */
  userMessage: string;
  now?: Date;
};

export type ProposeDeps = {
  autonomy: (userId: string, kind: string, now: Date) => Promise<AutonomyDecision>;
  execute: (userId: string, kind: ActionKind, payload: ActionPayload) => Promise<{ ok: boolean; message: string }>;
};

const defaultDeps: ProposeDeps = { autonomy: evaluateAutonomy, execute: executeVegaAction };

export type ProposeResult =
  | { blocked: true; response: Record<string, unknown> }
  | { blocked: false; action: VegaActionView; executed: boolean; status?: string; response: Record<string, unknown> };

const select = { id: true, kind: true, payload: true, status: true, result: true, riskClass: true, tainted: true, expiresAt: true, createdAt: true } as const;

/**
 * Aplica la política de confirmación a una acción que Vega preparó:
 * los envíos siempre esperan la tarjeta, las escrituras reversibles respetan la autonomía
 * y una acción que el socio ya canceló no se vuelve a proponer por iniciativa de Vega.
 */
export async function proposeAction(input: ProposeInput, deps: ProposeDeps = defaultDeps): Promise<ProposeResult> {
  const prisma = getPrisma();
  const now = input.now ?? new Date();
  const risk = classifyAction(input.kind, input.payload);
  const fingerprint = actionFingerprint(input.kind, input.payload);
  const declinedBefore = await wasDeclined(input.userId, fingerprint, now).catch(() => false);

  if (declinedBefore && !asksToRetry(input.userMessage)) {
    return {
      blocked: true,
      response: {
        estado: "bloqueada",
        nota: "El socio ya canceló esta misma acción. No la vuelvas a proponer por tu cuenta: pregúntale si quiere cambiar algo o si de verdad quiere intentarlo otra vez.",
      },
    };
  }

  const created = await prisma.vegaAction.create({
    data: {
      userId: input.userId,
      conversationId: input.chatId,
      kind: input.kind,
      payload: input.payload as unknown as Prisma.InputJsonValue,
      riskClass: risk,
      fingerprint,
      tainted: input.tainted,
      expiresAt: expiryFrom(now),
      createdAt: now,
    },
    select,
  });

  const autonomy =
    risk === "write" ? await deps.autonomy(input.userId, input.kind, now).catch(() => ({ ok: false, reason: "falló la revisión" }) as const) : null;
  const decision = decideExecution({ risk, autonomyOk: Boolean(autonomy?.ok), tainted: input.tainted, declinedBefore });

  if (decision.auto) {
    const claimed = await prisma.vegaAction.updateMany({
      where: { id: created.id, status: "pending" },
      data: { status: "running", decidedAt: now, executedBy: "autonomy" },
    });
    if (claimed.count === 1) {
      const result = await deps.execute(input.userId, input.kind, input.payload).catch(() => ({
        ok: false,
        message: "El servicio no respondió. No se completó la acción.",
      }));
      const updated = await prisma.vegaAction.update({
        where: { id: created.id },
        data: { status: result.ok ? "done" : "failed", result: result.message },
        select,
      });
      return {
        blocked: false,
        executed: true,
        action: actionView(updated, now),
        status: result.message,
        response: {
          estado: result.ok ? "ejecutada" : "fallo",
          detalle: result.message,
          nota: result.ok
            ? "La acción ya se ejecutó por la autonomía del socio: puedes decírselo con naturalidad."
            : "No se completó; avisa al socio y ofrece el siguiente paso.",
        },
      };
    }
  }

  const reason = decision.auto ? "" : decision.reason;
  return {
    blocked: false,
    executed: false,
    action: actionView(created, now),
    response:
      input.kind === "whatsapp_message"
        ? {
            estado: "listo_para_enviar",
            nota: "El socio ve el mensaje con un botón «Abrir en WhatsApp» y lo envía desde su propio número. No repitas el mensaje completo en tu respuesta.",
          }
        : {
            estado: "pendiente_de_confirmacion",
            motivo: reason,
            nota:
              risk === "send"
                ? "El socio ve una tarjeta con el destinatario y el contenido exactos, y decide con Confirmar o Cancelar. No digas que ya se envió. Vence en 24 horas."
                : "El socio ve una tarjeta con Confirmar o Cancelar. No digas que ya se hizo. Vence en 24 horas.",
          },
  };
}
