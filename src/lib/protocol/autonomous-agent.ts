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
      { name: "agent", type: "address", indexed: true },
      { name: "action", type: "string", indexed: false },
      { name: "asset", type: "string", indexed: false },
      { name: "amountIn", type: "uint256", indexed: false },
      { name: "amountOut", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
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
    name: "usdc",
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
    name: "COOLDOWN",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
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

/** ABI compilado en contractConfig.js. Los tipos siguen el evento real del contrato. */
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
