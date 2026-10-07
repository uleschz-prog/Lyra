"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createWalletClient, custom, erc20Abi, isAddress, parseUnits, type Address, type EIP1193Provider } from "viem";

import { lyraPublicClient } from "@/lib/wagmi";
import { agentFace, vegaMoodFor, vegaThinking } from "@/lib/protocol/agent-face";
import {
  AMOY_CHAIN_ID,
  AMOY_EXPLORER_URL,
  lyraAutonomousAgentAbi,
  lyraAutonomousAgentAddress,
  lyraRpcUrl,
} from "@/lib/protocol/autonomous-agent";
import { pickMetaMask, readInjectedEthereum, walletErrorMessage, type WalletAnnouncement } from "@/lib/protocol/metamask";
import { tradeExecutedMessage } from "@/lib/protocol/trade-event";

export type TradeRow = {
  id: string;
  action: string;
  profit: bigint;
  timestamp: bigint;
};

export type ProtocolStatus = {
  owner: Address;
  usdc: Address;
  weth: Address;
  balance: bigint;
  wethBalance: bigint;
  lastExecutionTime: bigint;
  cooldown: bigint;
  blockTimestamp: bigint;
  canExec: boolean;
  paused: boolean;
  ethPrice: bigint | null;
  feedDecimals: number;
};

function toRow(log: {
  transactionHash: `0x${string}` | null;
  logIndex: number | null;
  args: {
    action?: string;
    profit?: bigint;
    timestamp?: bigint;
  };
}): TradeRow | null {
  if (!log.args.action || log.args.profit === undefined) {
    return null;
  }
  return {
    id: `${log.transactionHash ?? "tx"}-${log.logIndex ?? 0}`,
    action: log.args.action,
    profit: log.args.profit,
    timestamp: log.args.timestamp ?? BigInt(0),
  };
}

export type WalletPhase = "checking" | "absent" | "available" | "connected";

function asAddress(value: unknown): Address | null {
  return typeof value === "string" && isAddress(value) ? value : null;
}

async function readChainId(provider: EIP1193Provider) {
  const hex = await provider.request({ method: "eth_chainId" });
  if (typeof hex !== "string") return null;
  const parsed = Number.parseInt(hex, 16);
  return Number.isFinite(parsed) ? parsed : null;
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
  const [busy, setBusy] = useState<"deposit" | "withdraw" | "control" | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [happy, setHappy] = useState(false);
  const [lastLog, setLastLog] = useState<string | null>(null);
  const [walletPhase, setWalletPhase] = useState<WalletPhase>("checking");
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [walletUsdc, setWalletUsdc] = useState<bigint | null>(null);
  const [walletPol, setWalletPol] = useState<bigint | null>(null);
  const [connecting, setConnecting] = useState(false);
  const knownTradeIds = useRef(new Set<string>());
  const providerRef = useRef<EIP1193Provider | null>(null);
  const announcedRef = useRef<WalletAnnouncement[]>([]);
  const pausedRef = useRef(false);

  const adoptProvider = useCallback((next: EIP1193Provider | null) => {
    if (!next) return;
    providerRef.current = next;
    setWalletPhase((current) => (current === "connected" ? "connected" : "available"));
  }, []);

  const syncWallet = useCallback(async (provider: EIP1193Provider, nextAccount: Address | null) => {
    const nextChain = await readChainId(provider).catch(() => null);
    setChainId(nextChain);
    setAccount(nextAccount);
    setWalletPhase(nextAccount ? "connected" : "available");
  }, []);

  useEffect(() => {
    let cancelled = false;
    announcedRef.current = [];

    function consider() {
      const picked = pickMetaMask(announcedRef.current, readInjectedEthereum());
      if (!cancelled) adoptProvider(picked);
    }

    function onAnnounce(event: Event) {
      const detail = (event as CustomEvent<{ info?: { name?: string; rdns?: string }; provider?: EIP1193Provider }>).detail;
      if (!detail?.provider) return;
      announcedRef.current = [
        ...announcedRef.current.filter((item) => item.rdns !== (detail.info?.rdns ?? "")),
        { name: detail.info?.name ?? "Wallet", rdns: detail.info?.rdns ?? "", provider: detail.provider },
      ];
      consider();
    }

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.addEventListener("ethereum#initialized", consider);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    consider();

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      consider();
      if (!providerRef.current) setWalletPhase((current) => (current === "connected" ? current : "absent"));
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      window.removeEventListener("ethereum#initialized", consider);
    };
  }, [adoptProvider]);

  useEffect(() => {
    const provider = providerRef.current;
    if (!provider || walletPhase === "absent" || walletPhase === "checking") return;
    let unsubscribe = () => {};
    const onAccounts = (accounts: Address[]) => {
      const next = accounts[0] ?? null;
      void syncWallet(provider, next);
    };
    const onChain = (hex: string) => {
      const parsed = Number.parseInt(hex, 16);
      if (Number.isFinite(parsed)) setChainId(parsed);
    };
    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    unsubscribe = () => {
      provider.removeListener("accountsChanged", onAccounts);
      provider.removeListener("chainChanged", onChain);
    };
    void provider.request({ method: "eth_accounts" }).then((accounts) => {
      if (pausedRef.current) return;
      const list = Array.isArray(accounts) ? accounts : [];
      const next = asAddress(list[0]);
      if (next) void syncWallet(provider, next);
    }).catch(() => undefined);
    return unsubscribe;
  }, [syncWallet, walletPhase]);

  useEffect(() => {
    if (!account || !status) {
      setWalletUsdc(null);
      setWalletPol(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [usdcBalance, polBalance] = await Promise.all([
          client.readContract({ address: status.usdc, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
          client.getBalance({ address: account }),
        ]);
        if (!cancelled) {
          setWalletUsdc(usdcBalance);
          setWalletPol(polBalance);
        }
      } catch {
        if (!cancelled) {
          setWalletUsdc(null);
          setWalletPol(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account, client, status]);

  const refreshStatus = useCallback(async () => {
    if (!address) return;
    try {
      const [owner, usdc, weth, lastExecutionTime, cooldown, checkerResult, feedDecimals, latestPrice, isPaused, block] =
        await Promise.all([
        client.readContract({ address, abi: lyraAutonomousAgentAbi, functionName: "owner" }),
        client.readContract({ address, abi: lyraAutonomousAgentAbi, functionName: "usdcToken" }),
        client.readContract({ address, abi: lyraAutonomousAgentAbi, functionName: "wethToken" }),
        client.readContract({ address, abi: lyraAutonomousAgentAbi, functionName: "lastExecutionTime" }),
        client.readContract({ address, abi: lyraAutonomousAgentAbi, functionName: "executionCooldown" }),
        client.readContract({ address, abi: lyraAutonomousAgentAbi, functionName: "checker" }),
        client.readContract({ address, abi: lyraAutonomousAgentAbi, functionName: "feedDecimals" }),
        client.readContract({ address, abi: lyraAutonomousAgentAbi, functionName: "getLatestPrice" }),
        client.readContract({ address, abi: lyraAutonomousAgentAbi, functionName: "paused" }),
        client.getBlock(),
      ]);
      const [balance, wethBalance] = await Promise.all([
        client.readContract({
          address: usdc,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        }),
        client.readContract({
          address: weth,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        }),
      ]);
      const price = latestPrice > BigInt(0) ? latestPrice : null;
      setStatus({
        owner,
        usdc,
        weth,
        balance,
        wethBalance,
        lastExecutionTime,
        cooldown,
        blockTimestamp: block.timestamp,
        canExec: checkerResult[0],
        paused: isPaused,
        ethPrice: price,
        feedDecimals: Number(feedDecimals),
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
      setLastLog(tradeExecutedMessage(latest.profit));
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

  function currentProvider() {
    return providerRef.current ?? pickMetaMask(announcedRef.current, readInjectedEthereum());
  }

  async function connectWallet(forcePicker = false) {
    setConnecting(true);
    setFormError(null);
    try {
      const provider = currentProvider();
      if (!provider) {
        setWalletPhase("absent");
        throw new Error("MetaMask no responde en este navegador. Instálala y pulsa Reintentar.");
      }
      adoptProvider(provider);
      pausedRef.current = false;
      if (forcePicker) {
        await provider.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
      }
      await ensureAmoy(provider);
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const list = Array.isArray(accounts) ? accounts : [];
      const next = asAddress(list[0]);
      if (!next) throw new Error("MetaMask no devolvió una cuenta.");
      await syncWallet(provider, next);
    } catch (error) {
      setFormError(walletErrorMessage(error));
    } finally {
      setConnecting(false);
    }
  }

  function disconnectWallet() {
    pausedRef.current = true;
    setAccount(null);
    setChainId(null);
    setWalletUsdc(null);
    setWalletPol(null);
    setWalletPhase(providerRef.current ? "available" : "absent");
  }

  async function withOwnerWallet(kind: "deposit" | "withdraw", run: (ownerAccount: Address) => Promise<void>) {
    setBusy(kind);
    setFormError(null);
    setFormMessage(null);
    try {
      const provider = currentProvider();
      if (!provider) throw new Error("MetaMask no responde en este navegador. Instálala y pulsa Reintentar.");
      if (!status) throw new Error("El protocolo todavía no responde.");
      adoptProvider(provider);
      await ensureAmoy(provider);
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const list = Array.isArray(accounts) ? accounts : [];
      const ownerAccount = asAddress(list[0]);
      if (!ownerAccount) throw new Error("MetaMask no devolvió una cuenta.");
      await syncWallet(provider, ownerAccount);
      if (ownerAccount.toLowerCase() !== status.owner.toLowerCase()) {
        throw new Error("Esta MetaMask no es la custodia del protocolo.");
      }
      await run(ownerAccount);
      await refreshStatus();
    } catch (error) {
      setFormError(walletErrorMessage(error));
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
      const provider = currentProvider();
      if (!provider) throw new Error("MetaMask no responde en este navegador. Instálala y pulsa Reintentar.");
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

  async function setAgentPaused(nextPaused: boolean) {
    setBusy("control");
    setFormError(null);
    setFormMessage(null);
    try {
      const response = await fetch("/api/protocol/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: nextPaused ? "pause" : "resume" }),
      });
      const body = (await response.json()) as { error?: string; paused?: boolean };
      if (!response.ok) {
        throw new Error(body.error || "No se pudo cambiar el agente.");
      }
      setFormMessage(body.paused ? "Agente pausado." : "Agente activo.");
      await refreshStatus();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo cambiar el agente.");
    } finally {
      setBusy(null);
    }
  }

  async function withdraw() {
    if (!address) return;
    const agent = address;
    await withOwnerWallet("withdraw", async (account) => {
      const amount = parseUsdcInput(withdrawAmount);
      const provider = currentProvider();
      if (!provider) throw new Error("MetaMask no responde en este navegador. Instálala y pulsa Reintentar.");
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
    setAgentPaused,
    walletPhase,
    account,
    chainId,
    walletUsdc,
    walletPol,
    connecting,
    onAmoy: chainId === AMOY_CHAIN_ID,
    isOwner: Boolean(account && status && account.toLowerCase() === status.owner.toLowerCase()),
    connectWallet,
    disconnectWallet,
  };
}
