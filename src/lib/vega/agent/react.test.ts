import assert from "node:assert/strict";
import test from "node:test";

import { masterPrompt } from "@/config/constellation";

import { buildDecisionPrompt, parseDecision } from "./prompt";
import { runVegaAgent } from "./react";

test("el prompt del agente es el Vega existente y nombra las tres herramientas", () => {
  const prompt = buildDecisionPrompt("qué hace la competencia", []);
  assert.ok(prompt.startsWith(masterPrompt));
  assert.match(prompt, /search_x/);
  assert.match(prompt, /query_history/);
  assert.match(prompt, /generate_report/);
  assert.equal(parseDecision('texto {"action":"search_x","input":"lyra"} más')?.action, "search_x");
  assert.equal(parseDecision("sin json"), null);
});

test("el grafo ReAct busca, consulta el histórico y arma el reporte", async () => {
  const script = [
    { action: "search_x" as const, input: "lyra" },
    { action: "query_history" as const, input: "lyra" },
    { action: "generate_report" as const, input: "compara" },
    { action: "finish" as const, input: "" },
  ];
  const used: string[] = [];
  const result = await runVegaAgent({
    goal: "compara a lyra",
    decide: async () => script.shift() ?? { action: "finish", input: "" },
    tools: {
      searchX: async (query) => {
        used.push(`search:${query}`);
        return "post de acme";
      },
      queryHistory: async (query) => {
        used.push(`history:${query}`);
        return "histórico";
      },
      generateReport: async () => {
        used.push("report");
        return "{\"status\":\"ready\"}";
      },
    },
  });
  assert.deepEqual(used, ["search:lyra", "history:lyra", "report"]);
  assert.equal(result.status, "finished");
  assert.equal(result.report, "{\"status\":\"ready\"}");
  assert.equal(result.steps, 3);
});

test("una decisión inválida no llama herramientas y el tope de pasos corta el ciclo", async () => {
  let tools = 0;
  const invalid = await runVegaAgent({
    goal: "x",
    decide: async () => ({ action: "finish", input: "", invalid: true }),
    tools: {
      searchX: async () => {
        tools += 1;
        return "";
      },
      queryHistory: async () => "",
      generateReport: async () => "",
    },
  });
  assert.equal(invalid.status, "invalid_decision");
  assert.equal(tools, 0);

  let calls = 0;
  const capped = await runVegaAgent({
    goal: "x",
    maxSteps: 1,
    decide: async () => ({ action: "search_x", input: "lyra" }),
    tools: {
      searchX: async () => {
        calls += 1;
        return "uno";
      },
      queryHistory: async () => "",
      generateReport: async () => "",
    },
  });
  assert.equal(calls, 1);
  assert.equal(capped.status, "max_steps");
});
