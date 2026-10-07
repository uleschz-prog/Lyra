import type { VegaMood } from "@/lib/vega/events";

/** Caras del dashboard. Vega las dibuja; no hay un cuadro de color aparte. */
export type AgentFace = "happy" | "alert" | "thinking" | "waiting";

export function agentFace(input: {
  statusError: string | null;
  tradeError: string | null;
  happy: boolean;
  loading: boolean;
  canExec: boolean;
}): AgentFace {
  if (input.statusError || input.tradeError) return "alert";
  if (input.happy) return "happy";
  if (input.loading || input.canExec) return "thinking";
  return "waiting";
}

export function vegaMoodFor(face: AgentFace): VegaMood {
  if (face === "happy") return "happy";
  if (face === "alert") return "angry";
  return "neutral";
}

export function vegaThinking(face: AgentFace) {
  return face === "thinking";
}

export function agentFaceLabel(face: AgentFace) {
  if (face === "happy") return "Feliz";
  if (face === "alert") return "Alerta";
  if (face === "thinking") return "Pensando";
  return "En espera";
}
