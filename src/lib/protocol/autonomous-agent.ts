import { isAddress } from "viem";

import { CONTRACT_ABI, CONTRACT_ADDRESS } from "@/lib/contractConfig";

/** Polygon Amoy. La sección del dashboard no cambia de red. */
export const AMOY_CHAIN_ID = 80002;

export const AMOY_PUBLIC_RPC_URL = "https://rpc-amoy.polygon.technology";

export const AMOY_EXPLORER_URL = "https://amoy.polygonscan.com";

const typedAgentAbi = [
  {
    type: "event",
    name: "StrategyExecuted",
    inputs: [
      { name: "timestamp", type: "uint256", indexed: false },
      { name: "action", type: "string", indexed: false },
      { name: "profit", type: "uint256", indexed: false },
    ],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "usdcToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "lastExecutionTime",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "executionCooldown",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "feedDecimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "wethToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "priceIsFresh",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "tradingEdge",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "pauseAgent",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "resumeAgent",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "getLatestPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "int256" }],
  },
  {
    type: "function",
    name: "checker",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "canExec", type: "bool" },
      { name: "execPayload", type: "bytes" },
    ],
  },
  {
    type: "function",
    name: "executeStrategy",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "depositUSDC",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
] as const;

/** ABI compilado en contractConfig.js. Los tipos siguen el evento timestamp, action, profit. */
export const lyraAutonomousAgentAbi = CONTRACT_ABI as unknown as typeof typedAgentAbi;

export function lyraRpcUrl(): string {
  const configured = process.env.NEXT_PUBLIC_LYRA_RPC_URL?.trim();
  return configured || AMOY_PUBLIC_RPC_URL;
}

/** Dirección pública del agente. Vacío o inválido = pantalla sin contrato. */
export function lyraAutonomousAgentAddress(): `0x${string}` | null {
  const fromEnv =
    process.env.NEXT_PUBLIC_LYRA_AUTONOMOUS_AGENT_ADDRESS?.trim() ||
    process.env.NEXT_PUBLIC_CONTRACT_ADDRESS?.trim();
  const raw = fromEnv || CONTRACT_ADDRESS;
  if (!raw || !isAddress(raw)) return null;
  return raw;
}
