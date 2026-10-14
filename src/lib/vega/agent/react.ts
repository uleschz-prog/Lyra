import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import { safeErrorMessage } from "../log";
import { parseDecision, type VegaAction } from "./prompt";

export type VegaDecision = { action: VegaAction; input: string; invalid?: boolean };

export type VegaAgentResult = {
  status: "finished" | "max_steps" | "invalid_decision";
  observations: string[];
  report: string | null;
  steps: number;
};

type ToolSet = {
  searchX: (query: string) => Promise<string>;
  queryHistory: (query: string) => Promise<string>;
  generateReport: (brief: string) => Promise<string>;
};

const AgentState = Annotation.Root({
  goal: Annotation<string>,
  steps: Annotation<number>,
  maxSteps: Annotation<number>,
  action: Annotation<string>,
  toolInput: Annotation<string>,
  observations: Annotation<string[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  report: Annotation<string | null>,
  status: Annotation<string>,
});

export async function runVegaAgent(input: {
  goal: string;
  decide: (state: { goal: string; observations: string[] }) => Promise<VegaDecision>;
  tools: ToolSet;
  maxSteps?: number;
}): Promise<VegaAgentResult> {
  const maxSteps = input.maxSteps ?? 4;

  const reason = async (state: typeof AgentState.State) => {
    if (state.steps >= state.maxSteps) {
      return { action: "finish", status: "max_steps" };
    }
    const decision = await input.decide({ goal: state.goal, observations: state.observations });
    const parsed = decision.invalid ? null : parseDecision(JSON.stringify({ action: decision.action, input: decision.input }));
    if (!parsed || decision.invalid) {
      return { action: "finish", status: "invalid_decision" };
    }
    if (parsed.action === "finish") {
      return {
        action: "finish",
        status: "finished",
        report: parsed.input.trim() ? parsed.input : state.report,
      };
    }
    return { action: parsed.action, toolInput: parsed.input, status: "running" };
  };

  const act = async (state: typeof AgentState.State) => {
    let output = "";
    try {
      output = await runTool(state.action, state.toolInput, input.tools);
    } catch (error) {
      output = safeErrorMessage(error);
    }
    const steps = state.steps + 1;
    return {
      steps,
      observations: [`${state.action}: ${output}`],
      report: state.action === "generate_report" ? output : state.report,
      status: steps >= state.maxSteps ? "max_steps" : "running",
      action: steps >= state.maxSteps ? "finish" : state.action,
    };
  };

  const graph = new StateGraph(AgentState)
    .addNode("reason", reason)
    .addNode("act", act)
    .addEdge(START, "reason")
    .addConditionalEdges("reason", (state) => (state.action === "finish" ? END : "act"))
    .addEdge("act", "reason")
    .compile();

  const result = await graph.invoke(
    {
      goal: input.goal,
      steps: 0,
      maxSteps,
      action: "",
      toolInput: "",
      observations: [],
      report: null,
      status: "running",
    },
    { recursionLimit: Math.max(12, maxSteps * 4) },
  );

  const status = result.status === "max_steps" || result.status === "invalid_decision" ? result.status : "finished";
  return {
    status,
    observations: result.observations,
    report: result.report,
    steps: result.steps,
  };
}

async function runTool(action: string, toolInput: string, tools: ToolSet): Promise<string> {
  if (action === "search_x") return tools.searchX(toolInput);
  if (action === "query_history") return tools.queryHistory(toolInput);
  if (action === "generate_report") return tools.generateReport(toolInput);
  return "Herramienta desconocida.";
}
