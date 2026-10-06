"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createWalletClient, custom, erc20Abi, parseUnits, type Address, type EIP1193Provider } from "viem";

import { lyraPublicClient } from "@/lib/wagmi";
import { agentFace, vegaMoodFor, vegaThinking } from "@/lib/protocol/agent-face";
import {
  AMOY_CHAIN_ID,
  AMOY_EXPLORER_URL,
  lyraAutonomousAgentAbi,
  lyraAutonomousAgentAddress,
  lyraRpcUrl,
} from "@/lib/protocol/autonomous-agent";
import { balanceAfterTrades, tradeExecutedMessage } from "@/lib/protocol/trade-event";

export type TradeRow = {
  id: string;
  action: string;
  asset: string;
  amountIn: bigint;
  amountOut: bigint;
  timestamp: bigint;
};

export type ProtocolStatus = {
  owner: Address;
  usdc: Address;
  balance: bigint;
  lastExecutionTime: bigint;
  cooldown: bigint;
  blockTimestamp: bigint;
  canExec: boolean;
};

function toRow(log: {
  transactionHash: `0x${string}` | null;
  logIndex: number | null;
  args: {
    action?: string;
    asset?: string;
    amountIn?: bigint;
    amountOut?: bigint;
    timestamp?: bigint;
  };
}): TradeRow | null {
  if (!log.args.action || !log.args.asset || log.args.amountIn === undefined || log.args.amountOut === undefined) {
    return null;
  }
  return {
    id: `${log.transactionHash ?? "tx"}-${log.logIndex ?? 0}`,
    action: log.args.action,
    asset: log.args.asset,
    amountIn: log.args.amountIn,
    amountOut: log.args.amountOut,
    timestamp: log.args.timestamp ?? BigInt(0),
  };
}

function injectedProvider(): EIP1193Provider | null {
  if (typeof window === "undefined") return null;
  const ethereum = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
  return ethereum ?? null;
}

function parseUsdcInput(raw: string) {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized || Number(normalized) <= 0) {
    throw new Error("Escribe una cantidad mayor que cero.");
  }
  return parseUnits(normalized, 6);
}

export function useLyraAgent() {
  const address = lyraAutonomousAgentAddress();
  const rpcUrl = lyraRpcUrl();
  const client = useMemo(() => lyraPublicClient(rpcUrl), [rpcUrl]);

  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState<ProtocolStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [busy, setBusy] = useState<"deposit" | "withdraw" | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [happy, setHappy] = useState(false);
  const [lastLog, setLastLog] = useState<string | null>(null);
  const knownTradeIds = useRef(new Set<string>());
  const pendingCredit = useRef<{ base: bigint; target: bigint } | null>(null);

  const refreshStatus = useCallback(async () => {
    if (!address) return;
    try {
      const [owner, usdc, lastExecutionTime, cooldown, checkerResult, block] = await Promise.all([
        client.readContract({ address, abi: lyraAutonomousAgentAbi, functionName: "owner" }),
        client.readContract({ address, abi: lyraAutonomousAgentAbi, functionName: "usdc" }),
        client.readContract({ address, abi: lyraAutonomousAgentAbi, functionName: "lastExecutionTime" }),
        client.readContract({ address, abi: lyraAutonomousAgentAbi, functionName: "COOLDOWN" }),
        client.readContract({ address, abi: lyraAutonomousAgentAbi, functionName: "checker" }),
        client.getBlock(),
      ]);
      const balance = await client.readContract({
        address: usdc,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      });
      setStatus(() => {
        const credit = pendingCredit.current;
        let shown = balance;
        if (credit) {
          if (balance >= credit.target || balance !== credit.base) {
            pendingCredit.current = null;
            shown = balance;
          } else {
            shown = credit.target;
          }
        }
        return {
          owner,
          usdc,
          balance: shown,
          lastExecutionTime,
          cooldown,
          blockTimestamp: block.timestamp,
          canExec: checkerResult[0],
        };
      });
      setStatusError(null);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "No se pudo leer la red.");
    }
  }, [address, client]);

  useEffect(() => {
    if (!address) return;
    const initial = window.setTimeout(() => void refreshStatus(), 0);
    const timer = window.setInterval(() => void refreshStatus(), 4_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [address, refreshStatus]);

  useEffect(() => {
    if (!address) return;
    const contractAddress: `0x${string}` = address;
    let unwatch: (() => void) | undefined;
    let cancelled = false;
    knownTradeIds.current = new Set();
    pendingCredit.current = null;
    setTrades([]);
    setHappy(false);
    setLastLog(null);

    function remember(incoming: TradeRow[], live: boolean) {
      const fresh = incoming.filter((row) => !knownTradeIds.current.has(row.id));
      if (fresh.length === 0) return;
      for (const row of fresh) knownTradeIds.current.add(row.id);
      setTrades((current) => [...fresh, ...current].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)));
      if (!live) return;
      const latest = fresh.reduce((best, row) => (row.timestamp >= best.timestamp ? row : best));
      setHappy(true);
      setTradeError(null);
      setLastLog(tradeExecutedMessage(latest.amountIn, latest.amountOut));
      setStatus((current) => {
        if (!current) return current;
        const target = balanceAfterTrades(current.balance, fresh);
        pendingCredit.current = { base: current.balance, target };
        return { ...current, balance: target };
      });
    }

    async function readHistory() {
      try {
        return await client.getContractEvents({
          address: contractAddress,
          abi: lyraAutonomousAgentAbi,
          eventName: "StrategyExecuted",
          fromBlock: BigInt(0),
          toBlock: "latest",
        });
      } catch {
        const latest = await client.getBlockNumber();
        const windowSize = BigInt(9_000);
        const fromBlock = latest > windowSize ? latest - windowSize : BigInt(0);
        return client.getContractEvents({
          address: contractAddress,
          abi: lyraAutonomousAgentAbi,
          eventName: "StrategyExecuted",
          fromBlock,
          toBlock: "latest",
        });
      }
    }

    async function start() {
      try {
        const logs = await readHistory();
        if (cancelled) return;
        remember(logs.map(toRow).filter((row): row is TradeRow => row !== null), false);
        unwatch = client.watchContractEvent({
          address: contractAddress,
          abi: lyraAutonomousAgentAbi,
          eventName: "StrategyExecuted",
          onLogs(logs) {
            remember(logs.map(toRow).filter((row): row is TradeRow => row !== null), true);
            void refreshStatus();
          },
          onError(watchError) {
            setTradeError(watchError.message);
          },
        });
        if (!cancelled) setListening(true);
      } catch (readError) {
        if (!cancelled) {
          setTradeError(readError instanceof Error ? readError.message : "No se pudo leer la red");
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
      unwatch?.();
    };
  }, [address, client, refreshStatus]);

  async function ensureAmoy(provider: EIP1193Provider) {
    const chainIdHex = `0x${AMOY_CHAIN_ID.toString(16)}`;
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? Number(error.code) : 0;
      if (code !== 4902) throw error;
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainIdHex,
            chainName: "Polygon Amoy",
            nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
            rpcUrls: [rpcUrl],
            blockExplorerUrls: [AMOY_EXPLORER_URL],
          },
        ],
      });
    }
  }

  async function withOwnerWallet(kind: "deposit" | "withdraw", run: (account: Address) => Promise<void>) {
    setBusy(kind);
    setFormError(null);
    setFormMessage(null);
    try {
      const provider = injectedProvider();
      if (!provider) throw new Error("No hay billetera en este navegador.");
      if (!status) throw new Error("El protocolo todavía no responde.");
      await ensureAmoy(provider);
      const wallet = createWalletClient({ chain: client.chain, transport: custom(provider) });
      const [account] = await wallet.requestAddresses();
      if (!account) throw new Error("La billetera no devolvió una cuenta.");
      if (account.toLowerCase() !== status.owner.toLowerCase()) {
        throw new Error("Solo el owner puede depositar o retirar.");
      }
      await run(account);
      await refreshStatus();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "La operación no se completó.");
    } finally {
      setBusy(null);
    }
  }

  async function deposit() {
    if (!address || !status) return;
    const agent = address;
    const usdc = status.usdc;
    await withOwnerWallet("deposit", async (account) => {
      const amount = parseUsdcInput(depositAmount);
      const provider = injectedProvider();
      if (!provider) throw new Error("No hay billetera en este navegador.");
      const wallet = createWalletClient({ account, chain: client.chain, transport: custom(provider) });
      const allowance = await client.readContract({
        address: usdc,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, agent],
      });
      if (allowance < amount) {
        const approval = await wallet.writeContract({
          address: usdc,
          abi: erc20Abi,
          functionName: "approve",
          args: [agent, amount],
        });
        await client.waitForTransactionReceipt({ hash: approval });
      }
      const hash = await wallet.writeContract({
        address: agent,
        abi: lyraAutonomousAgentAbi,
        functionName: "depositUSDC",
        args: [amount],
      });
      await client.waitForTransactionReceipt({ hash });
      setDepositAmount("");
      setFormMessage("Depósito enviado.");
    });
  }

  async function withdraw() {
    if (!address) return;
    const agent = address;
    await withOwnerWallet("withdraw", async (account) => {
      const amount = parseUsdcInput(withdrawAmount);
      const provider = injectedProvider();
      if (!provider) throw new Error("No hay billetera en este navegador.");
      const wallet = createWalletClient({ account, chain: client.chain, transport: custom(provider) });
      const hash = await wallet.writeContract({
        address: agent,
        abi: lyraAutonomousAgentAbi,
        functionName: "withdraw",
        args: [amount],
      });
      await client.waitForTransactionReceipt({ hash });
      setWithdrawAmount("");
      setFormMessage("Retiro enviado.");
    });
  }

  const face = agentFace({
    statusError,
    tradeError,
    happy,
    loading: Boolean(address) && !status && !statusError,
    canExec: Boolean(status?.canExec),
  });

  return {
    address,
    rpcUrl,
    status,
    trades,
    listening,
    statusError,
    tradeError,
    depositAmount,
    setDepositAmount,
    withdrawAmount,
    setWithdrawAmount,
    busy,
    formMessage,
    formError,
    lastLog,
    face,
    vegaMood: vegaMoodFor(face),
    thinking: vegaThinking(face),
    deposit,
    withdraw,
  };
}
