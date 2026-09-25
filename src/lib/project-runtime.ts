import { generateText } from "@/lib/ai/generate";
import type { ProjectInterface } from "@/lib/project-ui";
import { getPrisma } from "@/lib/prisma";

export type ProjectRunView = {
  id: string;
  agentName: string;
  flowName: string;
  output: string;
};

function localRun(name: string, instruction: string, input: string) {
  const detail = input.replace(/\s+/g, " ").trim().slice(0, 180);
  const step = detail || instruction;
  return `${name} tomó el registro. Siguiente paso: ${step}`.slice(0, 800);
}

export async function executeAgent(agent: { name: string; instruction: string }, input: string) {
  const fallback = localRun(agent.name, agent.instruction, input);
  try {
    const result = await generateText({
      system: `Eres ${agent.name}, un agente de LYRA que está en ejecución. ${agent.instruction} Responde solo el resultado útil, en español, en un párrafo corto, sin markdown.`,
      user: input,
      temperature: 0.4,
    });
    if (result.mode === "live") {
      const output = result.text.trim().replace(/\s+/g, " ").slice(0, 800);
      if (output) return output;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export async function ensureProjectRuntime(projectId: string, spec: ProjectInterface) {
  const prisma = getPrisma();
  const agents = await prisma.projectAgent.findMany({
    where: { projectId },
    select: { name: true },
  });
  for (const agent of spec.agents) {
    if (agents.some((item) => item.name === agent.name)) continue;
    await prisma.projectAgent.create({
      data: {
        projectId,
        name: agent.name,
        instruction: agent.instruction,
        status: "running",
      },
    });
    agents.push({ name: agent.name });
  }

  const flows = await prisma.projectFlow.findMany({
    where: { projectId },
    select: { name: true },
  });
  for (const flow of spec.flows) {
    if (flows.some((item) => item.name === flow.name)) continue;
    await prisma.projectFlow.create({
      data: {
        projectId,
        name: flow.name,
        tableName: flow.table,
        agentName: flow.agent,
        status: "running",
      },
    });
    flows.push({ name: flow.name });
  }
}

export async function listProjectRuns(projectId: string) {
  const runs = await getPrisma().projectRun.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { id: true, agentName: true, flowName: true, output: true },
  });
  return runs;
}

export async function runProjectFlows(
  userId: string,
  projectId: string,
  tableName: string,
  values: Record<string, string>,
) {
  const prisma = getPrisma();
  const flows = await prisma.projectFlow.findMany({
    where: { projectId, tableName, status: "running", project: { userId } },
    select: { name: true, agentName: true },
  });
  const input = Object.entries(values)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key, value]) => `${key}: ${value.trim()}`)
    .join("\n")
    .slice(0, 500);
  const runs: ProjectRunView[] = [];

  for (const flow of flows) {
    const agent = await prisma.projectAgent.findFirst({
      where: { projectId, name: flow.agentName, status: "running" },
      select: { id: true, name: true, instruction: true },
    });
    if (!agent) continue;
    const output = await executeAgent(agent, input || agent.instruction);
    const run = await prisma.projectRun.create({
      data: {
        projectId,
        agentId: agent.id,
        agentName: agent.name,
        flowName: flow.name,
        input: input || agent.instruction,
        output,
      },
      select: { id: true, agentName: true, flowName: true, output: true },
    });
    runs.push(run);
  }

  return runs;
}
