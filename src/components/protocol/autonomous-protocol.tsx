"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  formatUnits,
  http,
  parseUnits,
  type Address,
  type EIP1193Provider,
} from "viem";
import { polygonAmoy } from "viem/chains";

import { Button } from "@/components/ui/button";
import {
  AMOY_CHAIN_ID,
  AMOY_EXPLORER_URL,
  lyraAutonomousAgentAbi,
  lyraAutonomousAgentAddress,
  lyraRpcUrl,
} from "@/lib/protocol/autonomous-agent";

type TradeRow = {
  id: string;
  action: string;
  asset: string;
  amountIn: bigint;
  amountOut: bigint;
  timestamp: bigint;
};

type ProtocolStatus = {
  owner: Address;
  usdc: Address;
  balance: bigint;
  lastExecutionTime: bigint;
  cooldown: bigint;
  blockTimestamp: bigint;
  canExec: boolean;
};

const fieldClass =
  "mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-[#7C3AED]";

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function formatUsdc(amount: bigint) {
  const value = Number(formatUnits(amount, 6));
  return `${new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} USDC`;
}

function formatTradeTime(timestamp: bigint) {
  const date = new Date(Number(timestamp) * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatRemaining(seconds: bigint) {
  if (seconds <= BigInt(0)) return "Listo";
  const total = Number(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes <= 0) return `${rest} s`;
  return `${minutes} min ${rest} s`;
}

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

export function AutonomousProtocol() {
  const address = lyraAutonomousAgentAddress();
  const rpcUrl = lyraRpcUrl();
  const client = useMemo(
    () =>
      createPublicClient({
        chain: polygonAmoy,
        transport: http(rpcUrl),
        pollingInterval: 1_000,
      }),
    [rpcUrl],
  );

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
      setStatus({
        owner,
        usdc,
        balance,
        lastExecutionTime,
        cooldown,
        blockTimestamp: block.timestamp,
        canExec: checkerResult[0],
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

    function merge(incoming: TradeRow[]) {
      setTrades((current) => {
        const seen = new Set(current.map((row) => row.id));
        const fresh = incoming.filter((row) => !seen.has(row.id));
        if (fresh.length === 0) return current;
        return [...fresh, ...current].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
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
        // Los RPC públicos de Amoy rechazan rangos de más de 10 000 bloques.
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
        merge(logs.map(toRow).filter((row): row is TradeRow => row !== null));
        unwatch = client.watchContractEvent({
          address: contractAddress,
          abi: lyraAutonomousAgentAbi,
          eventName: "StrategyExecuted",
          onLogs(logs) {
            merge(logs.map(toRow).filter((row): row is TradeRow => row !== null));
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
      const wallet = createWalletClient({ chain: polygonAmoy, transport: custom(provider) });
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

  async function onDeposit() {
    if (!address || !status) return;
    const agent = address;
    const usdc = status.usdc;
    await withOwnerWallet("deposit", async (account) => {
      const amount = parseUsdcInput(depositAmount);
      const wallet = createWalletClient({
        account,
        chain: polygonAmoy,
        transport: custom(injectedProvider()!),
      });
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

  async function onWithdraw() {
    if (!address) return;
    const agent = address;
    await withOwnerWallet("withdraw", async (account) => {
      const amount = parseUsdcInput(withdrawAmount);
      const wallet = createWalletClient({
        account,
        chain: polygonAmoy,
        transport: custom(injectedProvider()!),
      });
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

  if (!address) {
    return (
      <section className="rounded-2xl border border-dashed border-[#D9D5CE] bg-white px-5 py-10 text-center dark:border-white/12 dark:bg-[#181625]">
        <p className="text-sm text-[#5C5854] dark:text-[#9B96AC]">Sin contrato configurado</p>
      </section>
    );
  }

  const readyAt = status ? status.lastExecutionTime + status.cooldown : BigInt(0);
  const remaining = status && status.blockTimestamp < readyAt ? readyAt - status.blockTimestamp : BigInt(0);
  const localRpc = /localhost|127\.0\.0\.1/.test(rpcUrl);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-border bg-surface p-6">
          <p className="text-[11px] font-medium tracking-[0.22em] text-[#5C5854] uppercase dark:text-[#9B96AC]">Red</p>
          <p className="mt-3 text-lg font-medium text-foreground">Polygon Amoy</p>
          <p className="mt-1 text-sm text-muted">chainId {AMOY_CHAIN_ID}</p>
        </article>
        <article className="rounded-2xl border border-border bg-surface p-6">
          <p className="text-[11px] font-medium tracking-[0.22em] text-[#5C5854] uppercase dark:text-[#9B96AC]">Saldo USDC</p>
          <p className="mt-3 text-3xl text-[#7C3AED] tabular-nums">{status ? formatUsdc(status.balance) : "…"}</p>
          <p className="mt-1 text-sm text-muted">{status?.canExec ? "El keeper puede ejecutar" : "Esperando cooldown o saldo"}</p>
        </article>
        <article className="rounded-2xl border border-border bg-surface p-6">
          <p className="text-[11px] font-medium tracking-[0.22em] text-[#5C5854] uppercase dark:text-[#9B96AC]">Cooldown</p>
          <p className="mt-3 text-3xl text-foreground tabular-nums">{status ? formatRemaining(remaining) : "…"}</p>
          <p className="mt-1 text-sm text-muted">10 minutos entre ejecuciones</p>
        </article>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-sm tracking-[0.16em] text-foreground">ESTADO</h2>
        {statusError ? <p className="mt-3 text-sm text-[#9F1239]">{statusError}</p> : null}
        {status ? (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[#8A8680]">Contrato</dt>
              <dd className="mt-1 font-mono text-foreground">
                {localRpc ? (
                  shortAddress(address)
                ) : (
                  <a className="text-[#7C3AED] hover:underline" href={`${AMOY_EXPLORER_URL}/address/${address}`}>
                    {shortAddress(address)}
                  </a>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[#8A8680]">Owner</dt>
              <dd className="mt-1 font-mono text-foreground">{shortAddress(status.owner)}</dd>
            </div>
            <div>
              <dt className="text-[#8A8680]">USDC</dt>
              <dd className="mt-1 font-mono text-foreground">{shortAddress(status.usdc)}</dd>
            </div>
            <div>
              <dt className="text-[#8A8680]">Última ejecución</dt>
              <dd className="mt-1 text-foreground">
                {status.lastExecutionTime === BigInt(0) ? "Aún no corre" : formatTradeTime(status.lastExecutionTime)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted">Leyendo el protocolo…</p>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <form
          className="rounded-2xl border border-border bg-surface p-6"
          onSubmit={(event) => {
            event.preventDefault();
            void onDeposit();
          }}
        >
          <h2 className="text-sm tracking-[0.16em] text-foreground">DEPÓSITO</h2>
          <p className="mt-2 text-sm text-muted">Solo el owner. Aprueba USDC y lo mueve al agente.</p>
          <label className="mt-4 block text-sm text-foreground">
            Cantidad USDC
            <input
              inputMode="decimal"
              value={depositAmount}
              onChange={(event) => setDepositAmount(event.target.value)}
              className={fieldClass}
              placeholder="1000"
            />
          </label>
          <Button type="submit" className="mt-4" disabled={busy !== null || !status}>
            {busy === "deposit" ? "Depositando…" : "Depositar"}
          </Button>
        </form>
        <form
          className="rounded-2xl border border-border bg-surface p-6"
          onSubmit={(event) => {
            event.preventDefault();
            void onWithdraw();
          }}
        >
          <h2 className="text-sm tracking-[0.16em] text-foreground">RETIRO</h2>
          <p className="mt-2 text-sm text-muted">Solo el owner, y nunca por encima del saldo.</p>
          <label className="mt-4 block text-sm text-foreground">
            Cantidad USDC
            <input
              inputMode="decimal"
              value={withdrawAmount}
              onChange={(event) => setWithdrawAmount(event.target.value)}
              className={fieldClass}
              placeholder="100"
            />
          </label>
          <Button type="submit" variant="secondary" className="mt-4" disabled={busy !== null || !status}>
            {busy === "withdraw" ? "Retirando…" : "Retirar"}
          </Button>
        </form>
      </section>
      {formMessage ? <p className="text-sm text-[#059669]">{formMessage}</p> : null}
      {formError ? <p className="text-sm text-[#9F1239]">{formError}</p> : null}

      <section className="rounded-2xl border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-sm tracking-[0.16em] text-foreground">TRADES</h2>
          {listening ? <p className="text-xs font-medium text-[#059669]">En vivo</p> : null}
        </div>
        {tradeError && trades.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No se pudo leer la red. Revisa la dirección y el RPC.</p>
        ) : trades.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">Todavía no hay trades. Cuando el keeper ejecute la estrategia, aparecen aquí.</p>
        ) : (
          <ul>
            {trades.map((trade) => (
              <li
                key={trade.id}
                className="grid gap-2 border-b border-border px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {trade.action} · {trade.asset}
                  </p>
                  <p className="text-xs text-[#8A8680]">{formatTradeTime(trade.timestamp)}</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-sm tabular-nums text-[#5C5854] dark:text-[#9B96AC]">{formatUsdc(trade.amountIn)}</p>
                  <p className="text-sm font-medium tabular-nums text-[#059669]">{formatUsdc(trade.amountOut)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
