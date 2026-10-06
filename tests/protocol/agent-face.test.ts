import { describe, expect, it } from "vitest";

import { agentFace, agentFaceLabel, vegaMoodFor, vegaThinking } from "@/lib/protocol/agent-face";
import { lyraAutonomousAgentAddress } from "@/lib/protocol/autonomous-agent";

const quiet = { statusError: null, tradeError: null, happy: false, loading: false, canExec: false };

describe("cara del agente", () => {
  it("prioriza alerta, luego feliz, luego pensando", () => {
    expect(agentFace({ ...quiet, statusError: "rpc", happy: true, canExec: true })).toBe("alert");
    expect(agentFace({ ...quiet, happy: true, canExec: true })).toBe("happy");
    expect(agentFace({ ...quiet, canExec: true })).toBe("thinking");
    expect(agentFace({ ...quiet, loading: true })).toBe("thinking");
    expect(agentFace(quiet)).toBe("waiting");
  });

  it("traduce la cara al ánimo de Vega", () => {
    expect(vegaMoodFor("happy")).toBe("happy");
    expect(vegaMoodFor("alert")).toBe("angry");
    expect(vegaMoodFor("waiting")).toBe("neutral");
    expect(vegaThinking("thinking")).toBe(true);
    expect(agentFaceLabel("alert")).toBe("Alerta");
  });
});

describe("dirección del contrato", () => {
  it("acepta NEXT_PUBLIC_CONTRACT_ADDRESS como alias", () => {
    const previousLyra = process.env.NEXT_PUBLIC_LYRA_AUTONOMOUS_AGENT_ADDRESS;
    const previousAlias = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
    delete process.env.NEXT_PUBLIC_LYRA_AUTONOMOUS_AGENT_ADDRESS;
    process.env.NEXT_PUBLIC_CONTRACT_ADDRESS = "0x1111111111111111111111111111111111111111";
    try {
      expect(lyraAutonomousAgentAddress()).toBe("0x1111111111111111111111111111111111111111");
    } finally {
      if (previousLyra === undefined) delete process.env.NEXT_PUBLIC_LYRA_AUTONOMOUS_AGENT_ADDRESS;
      else process.env.NEXT_PUBLIC_LYRA_AUTONOMOUS_AGENT_ADDRESS = previousLyra;
      if (previousAlias === undefined) delete process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
      else process.env.NEXT_PUBLIC_CONTRACT_ADDRESS = previousAlias;
    }
  });
});
