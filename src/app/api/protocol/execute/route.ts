import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";

import { cronAuthorized, decideKeeper, isKeeperKey, keeperCallError } from "@/lib/protocol/keeper";
import {
  lyraAutonomousAgentAbi,
  lyraAutonomousAgentAddress,
  lyraRpcUrl,
} from "@/lib/protocol/autonomous-agent";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const erc20BalanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

function amoyClient() {
  return createPublicClient({
    chain: polygonAmoy,
    transport: http(lyraRpcUrl(), {
      fetchOptions: { headers: { "User-Agent": "lyra-keeper" } },
    }),
  });
}

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const address = lyraAutonomousAgentAddress();
  if (!address) {
    return NextResponse.json({ ok: true, skipped: "sin_contrato" });
  }

  const key = process.env.LYRA_KEEPER_PRIVATE_KEY?.trim();
  const publicClient = amoyClient();

  try {
    const [checker, usdcToken, wethToken, lastExecutionTime, executionCooldown, owner, isPaused, priceFresh, edge, block] =
      await Promise.all([
        publicClient.readContract({ address, abi: lyraAutonomousAgentAbi, functionName: "checker" }),
        publicClient.readContract({ address, abi: lyraAutonomousAgentAbi, functionName: "usdcToken" }),
        publicClient.readContract({ address, abi: lyraAutonomousAgentAbi, functionName: "wethToken" }),
        publicClient.readContract({ address, abi: lyraAutonomousAgentAbi, functionName: "lastExecutionTime" }),
        publicClient.readContract({ address, abi: lyraAutonomousAgentAbi, functionName: "executionCooldown" }),
        publicClient.readContract({ address, abi: lyraAutonomousAgentAbi, functionName: "owner" }),
        publicClient.readContract({ address, abi: lyraAutonomousAgentAbi, functionName: "paused" }),
        publicClient.readContract({ address, abi: lyraAutonomousAgentAbi, functionName: "priceIsFresh" }),
        publicClient.readContract({ address, abi: lyraAutonomousAgentAbi, functionName: "tradingEdge" }),
        publicClient.getBlock(),
      ]);

    const [usdcBalance, wethBalance] = await Promise.all([
      publicClient.readContract({
        address: usdcToken,
        abi: erc20BalanceAbi,
        functionName: "balanceOf",
        args: [address],
      }),
      publicClient.readContract({
        address: wethToken,
        abi: erc20BalanceAbi,
        functionName: "balanceOf",
        args: [address],
      }),
    ]);

    let executorIsOwner = false;
    if (isKeeperKey(key)) {
      const account = privateKeyToAccount(key as `0x${string}`);
      executorIsOwner = account.address.toLowerCase() === owner.toLowerCase();
    }

    const decision = decideKeeper({
      hasExecutor: isKeeperKey(key),
      executorIsOwner,
      canExec: checker[0],
      paused: isPaused,
      priceFresh,
      edge,
      usdcBalance,
      wethBalance,
      lastExecutionTime,
      executionCooldown,
      now: block.timestamp,
    });

    if (decision.action === "skip") {
      return NextResponse.json({ ok: true, skipped: decision.reason });
    }

    const account = privateKeyToAccount(key as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: polygonAmoy,
      transport: http(lyraRpcUrl(), {
        fetchOptions: { headers: { "User-Agent": "lyra-keeper" } },
      }),
    });

    const { request: tx } = await publicClient.simulateContract({
      account,
      address,
      abi: lyraAutonomousAgentAbi,
      functionName: "executeStrategy",
    });
    const hash = await walletClient.writeContract(tx);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 45_000 });
    if (receipt.status !== "success") {
      return NextResponse.json({ ok: false, hash }, { status: 502 });
    }
    return NextResponse.json({ ok: true, hash });
  } catch (error) {
    const mapped = keeperCallError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
