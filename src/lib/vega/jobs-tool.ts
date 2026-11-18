import type { Prisma } from "@/generated/prisma/client";
import { creditPrices } from "@/lib/credits/prices";
import type { getPrisma } from "@/lib/prisma";
import { actionView } from "@/lib/vega/decide";
import type { VegaActionView } from "@/lib/vega/events";
import { delegationPlan, pickTeammate, planFromArgs, type JobDraft, type JobStep } from "@/lib/vega/jobs-core";

export { backgroundJobDeclaration, backgroundJobTool, delegateDeclaration, delegateTool } from "@/lib/vega/jobs-core";

type Db = ReturnType<typeof getPrisma>;

export type { JobDraft } from "@/lib/vega/jobs-core";

type Plan = { title: string; goal: string; steps: JobStep[] };
type Delegate = NonNullable<JobDraft["job"]["delegate"]>;
type Started =
  | { ok: true; jobId: string; title: string; action: VegaActionView; response: Record<string, unknown> }
  | { ok: false; error: string };

const MAX_ACTIVE_JOBS = 3;

/** Tarjeta (en la conversación de origen) + trabajo (en la conversación donde se hace) en una transacción. */
async function createJob(
  db: Db,
  input: { userId: string; originChatId: string; jobChatId: string; agentId: string | null; plan: Plan; delegate?: Delegate },
) {
  const { plan } = input;
  const draft = (jobId: string): JobDraft => ({
    job: { jobId, title: plan.title, steps: plan.steps.map((step) => step.title), ...(input.delegate ? { delegate: input.delegate } : {}) },
  });
  return db.$transaction(async (tx) => {
    const action = await tx.vegaAction.create({
      data: {
        userId: input.userId,
        conversationId: input.originChatId,
        kind: "background_job",
        payload: draft("") as unknown as Prisma.InputJsonValue,
        status: "running",
        result: input.delegate ? `Lo hace ${input.delegate.name}: ${plan.title}` : `En segundo plano: ${plan.title}`,
        riskClass: "internal",
        decidedAt: new Date(),
        executedBy: "system",
      },
      select: { id: true },
    });
    const job = await tx.vegaJob.create({
      data: {
        userId: input.userId,
        conversationId: input.jobChatId,
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
      data: { payload: draft(job.id) as unknown as Prisma.InputJsonValue },
      select: { id: true, kind: true, payload: true, status: true, result: true },
    });
    return { jobId: job.id, action: updated };
  });
}

async function tooManyJobs(db: Db, userId: string) {
  const active = await db.vegaJob.count({ where: { userId, status: { in: ["queued", "running"] } } });
  return active >= MAX_ACTIVE_JOBS;
}

const busy = { ok: false as const, error: `El socio ya tiene ${MAX_ACTIVE_JOBS} trabajos en curso. Dile que espere a que termine uno o que cancele alguno.` };

/** Crea el trabajo y su tarjeta. No ejecuta ningún paso (eso lo hacen los pasos cortos). */
export async function startBackgroundJob(
  db: Db,
  input: { userId: string; chatId: string; agentId: string | null; args: Record<string, unknown> },
): Promise<Started> {
  const plan = planFromArgs(input.args);
  if (!plan.ok) return plan;
  if (await tooManyJobs(db, input.userId)) return busy;
  const created = await createJob(db, { userId: input.userId, originChatId: input.chatId, jobChatId: input.chatId, agentId: input.agentId, plan });
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

/**
 * Vega v2 · V3: pasa una tarea a otro agente del socio. Se abre una conversación nueva de ese
 * agente y el trabajo corre ahí (con su memoria y personalidad); la tarjeta queda en el chat de origen.
 */
export async function startDelegation(
  db: Db,
  input: { userId: string; chatId: string; fromAgentId: string; args: Record<string, unknown> },
): Promise<Started> {
  const agents = await db.vegaAgent.findMany({ where: { userId: input.userId }, select: { id: true, name: true, avatar: true }, take: 50 });
  const from = agents.find((agent) => agent.id === input.fromAgentId);
  const target = pickTeammate(agents.filter((agent) => agent.id !== input.fromAgentId), input.args.agente);
  if (!target) {
    const names = agents.filter((agent) => agent.id !== input.fromAgentId).map((agent) => agent.name);
    return { ok: false, error: names.length ? `No encontré ese agente. Los disponibles son: ${names.join(", ")}.` : "El socio no tiene otros agentes." };
  }
  const plan = delegationPlan(input.args);
  if (!plan.ok) return plan;
  if (await tooManyJobs(db, input.userId)) return busy;
  const goal = `${plan.goal}\n\n(Te lo pasó ${from?.name ?? "otro agente"}, otro agente del socio. Tu resultado le llegará al socio en esa conversación.)`;
  const chat = await db.vegaConversation.create({
    data: { userId: input.userId, agentId: target.id, title: `De ${from?.name ?? "otro agente"}: ${plan.title}`.slice(0, 80) },
    select: { id: true },
  });
  await db.vegaMessage.create({
    data: {
      conversationId: chat.id,
      role: "assistant",
      content: `${from?.name ?? "Otro agente"} me pasó este encargo:\n\n${plan.goal}\n\nTrabajo en segundo plano; el resultado queda aquí y en su conversación.`,
      meta: { delegatedFrom: input.chatId },
    },
  });
  const created = await createJob(db, {
    userId: input.userId,
    originChatId: input.chatId,
    jobChatId: chat.id,
    agentId: target.id,
    plan: { ...plan, goal },
    delegate: { agentId: target.id, name: target.name, avatar: target.avatar, conversationId: chat.id },
  });
  return {
    ok: true,
    jobId: created.jobId,
    title: plan.title,
    action: actionView(created.action),
    response: {
      estado: "delegado",
      agente: target.name,
      pasos: plan.steps.length,
      nota: `${target.name} ya trabaja en «${plan.title}» en su propia conversación; el socio ve una tarjeta con el avance y puede cancelarla. El resultado llegará a esta conversación. Responde en UNA frase corta; no hagas la tarea tú ni inventes resultados.`,
    },
  };
}
