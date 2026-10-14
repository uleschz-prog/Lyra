import { masterPrompt } from "@/config/constellation";

export type VegaAction = "search_x" | "query_history" | "generate_report" | "finish";

const actions = new Set<VegaAction>(["search_x", "query_history", "generate_report", "finish"]);

export function buildDecisionPrompt(goal: string, observations: string[]): string {
  const history = observations
    .slice(-6)
    .map((item) => item.slice(0, 500))
    .join("\n");
  return `${masterPrompt}

Eres el mismo Vega. Decides el siguiente paso de inteligencia de mercado y respondes solo JSON.
Herramientas: search_x consulta el corpus ya ingerido (no abre una consulta de X por usuario); query_history busca el histórico en Qdrant; generate_report redacta el informe; finish cierra.
{"action":"search_x|query_history|generate_report|finish","input":"texto breve"}
Objetivo: ${goal}
Observaciones:
${history || "Ninguna."}`;
}

export function parseDecision(text: string): { action: VegaAction; input: string } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1)) as { action?: unknown; input?: unknown };
    if (typeof value.action !== "string" || !actions.has(value.action as VegaAction)) return null;
    return { action: value.action as VegaAction, input: typeof value.input === "string" ? value.input.slice(0, 2000) : "" };
  } catch {
    return null;
  }
}
