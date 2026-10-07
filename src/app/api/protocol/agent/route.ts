import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";

import { getCurrentUser } from "@/lib/auth/profile";
import { isKeeperKey } from "@/lib/protocol/keeper";
import {
  lyraAutonomousAgentAbi,
  lyraAutonomousAgentAddress,
  lyraRpcUrl,
} from "@/lib/protocol/autonomous-agent";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function amoyClient() {
  return createPublicClient({
    chain: polygonAmoy,
    transport: http(lyraRpcUrl(), {
      fetchOptions: { headers: { "User-Agent": "lyra-keeper" } },
    }),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo el administrador puede pausar el agente." }, { status: 403 });
  }

  let action: string | undefined;
  try {
    const body = (await request.json()) as { action?: unknown };
    action = typeof body.action === "string" ? body.action : undefined;
  } catch {
    action = undefined;
  }
  if (action !== "pause" && action !== "resume") {
    return NextResponse.json({ error: "Indica si quieres pausar o activar." }, { status: 400 });
  }

  const address = lyraAutonomousAgentAddress();
  if (!address) {
    return NextResponse.json({ error: "No hay contrato configurado." }, { status: 404 });
  }

  const key = process.env.LYRA_KEEPER_PRIVATE_KEY?.trim();
  if (!isKeeperKey(key)) {
    return NextResponse.json({ error: "El interruptor del agente no está listo." }, { status: 503 });
  }

  const publicClient = amoyClient();
  const account = privateKeyToAccount(key as `0x${string}`);
  const wantPaused = action === "pause";

  try {
    const isPaused = await publicClient.readContract({
      address,
      abi: lyraAutonomousAgentAbi,
      functionName: "paused",
    });
    if (isPaused === wantPaused) {
      return NextResponse.json({ ok: true, paused: isPaused });
    }

    const walletClient = createWalletClient({
      account,
      chain: polygonAmoy,
      transport: http(lyraRpcUrl(), {
        fetchOptions: { headers: { "User-Agent": "lyra-keeper" } },
      }),
    });
    const functionName = wantPaused ? "pauseAgent" : "resumeAgent";
    const { request: tx } = await publicClient.simulateContract({
      account,
      address,
      abi: lyraAutonomousAgentAbi,
      functionName,
    });
    const hash = await walletClient.writeContract(tx);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 45_000 });
    if (receipt.status !== "success") {
      return NextResponse.json({ error: "La red no confirmó el cambio." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, paused: wantPaused, hash });
  } catch {
    return NextResponse.json({ error: "No se pudo cambiar el agente. Inténtalo de nuevo." }, { status: 502 });
  }
}
