import type { Prisma } from "@/generated/prisma/client";
import { creditPrices } from "@/lib/credits/prices";
import type { getPrisma } from "@/lib/prisma";
import { actionView } from "@/lib/vega/decide";
import type { VegaActionView } from "@/lib/vega/events";
import { planFromArgs } from "@/lib/vega/jobs-core";

export { backgroundJobDeclaration, backgroundJobTool } from "@/lib/vega/jobs-core";

type Db = ReturnType<typeof getPrisma>;


export type { JobDraft } from "@/lib/vega/jobs-core";


/** Crea el trabajo y su tarjeta. No ejecuta ningún paso (eso lo hacen los pasos cortos). */
export async function startBackgroundJob(
  db: Db,
  input: { userId: string; chatId: string; agentId: string | null; args: Record<string, unknown> },
): Promise<
  | { ok: true; jobId: string; title: string; action: VegaActionView; response: Record<string, unknown> }
  | { ok: false; error: string }
> {
  const plan = planFromArgs(input.args);
  if (!plan.ok) return plan;
  const active = await db.vegaJob.count({ where: { userId: input.userId, status: { in: ["queued", "running"] } } });
  if (active >= 3) return { ok: false, error: "El socio ya tiene 3 trabajos en curso. Dile que espere a que termine uno o que cancele alguno." };
  const created = await db.$transaction(async (tx) => {
    const action = await tx.vegaAction.create({
      data: {
        userId: input.userId,
        conversationId: input.chatId,
        kind: "background_job",
        payload: { job: { jobId: "", title: plan.title, steps: plan.steps.map((step) => step.title) } } as unknown as Prisma.InputJsonValue,
        status: "running",
        result: `En segundo plano: ${plan.title}`,
        riskClass: "internal",
        decidedAt: new Date(),
        executedBy: "system",
      },
      select: { id: true },
    });
    const job = await tx.vegaJob.create({
      data: {
        userId: input.userId,
        conversationId: input.chatId,
        agentId: input.agentId,
        actionId: action.id,
        title: plan.title,
        goal: plan.goal,
        steps: plan.steps as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    const updated = await tx.vegaAction.update({
      where: { id: action.id },
      data: { payload: { job: { jobId: job.id, title: plan.title, steps: plan.steps.map((step) => step.title) } } as unknown as Prisma.InputJsonValue },
      select: { id: true, kind: true, payload: true, status: true, result: true },
    });
    return { jobId: job.id, action: updated };
  });
  return {
    ok: true,
    jobId: created.jobId,
    title: plan.title,
    action: actionView(created.action),
    response: {
      estado: "en_segundo_plano",
      pasos: plan.steps.length,
      nota: `El socio ya ve una tarjeta con el avance de los ${plan.steps.length} pasos y un botón para cancelar. Cada paso cuesta ${creditPrices.vegaMessage} crédito (o ${creditPrices.vegaTool} si usa herramientas). Responde en UNA frase corta: confirma que empezaste «${plan.title}» y que puede seguir platicando. No hagas el trabajo ahora ni inventes resultados.`,
    },
  };
}
