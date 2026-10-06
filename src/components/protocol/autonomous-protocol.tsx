"use client";

import { Button } from "@/components/ui/button";
import { VegaMark } from "@/components/vega/vega-mark";
import { AMOY_CHAIN_ID, AMOY_EXPLORER_URL } from "@/lib/protocol/autonomous-agent";
import { agentFaceLabel } from "@/lib/protocol/agent-face";
import { formatUsdc } from "@/lib/protocol/trade-event";
import { useLyraAgent } from "@/hooks/useLyraAgent";

const fieldClass =
  "mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-[#8b5cf6]";

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
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

export function AutonomousProtocol() {
  const {
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
    vegaMood,
    thinking,
    deposit,
    withdraw,
  } = useLyraAgent();

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
      <section className="flex flex-col items-center rounded-2xl border border-[#DDD6FE] bg-surface px-6 py-8 text-center dark:border-white/12">
        <VegaMark className="size-36" mood={vegaMood} thinking={thinking} />
        <p className="sr-only">{agentFaceLabel(face)}</p>
        <p className="mt-4 max-w-sm text-sm text-muted" aria-live="polite">
          {lastLog ?? "Escuchando StrategyExecuted en Polygon Amoy."}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-border bg-surface p-6">
          <p className="text-[11px] font-medium tracking-[0.22em] text-[#5C5854] uppercase dark:text-[#9B96AC]">Red</p>
          <p className="mt-3 text-lg font-medium text-foreground">Polygon Amoy</p>
          <p className="mt-1 text-sm text-muted">chainId {AMOY_CHAIN_ID}</p>
        </article>
        <article className="rounded-2xl border border-border bg-surface p-6">
          <p className="text-[11px] font-medium tracking-[0.22em] text-[#5C5854] uppercase dark:text-[#9B96AC]">Saldo USDC</p>
          <p className="mt-3 text-3xl text-[#8b5cf6] tabular-nums">{status ? formatUsdc(status.balance) : "…"}</p>
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
        {statusError ? <p className="mt-3 text-sm text-[#e11d48]">{statusError}</p> : null}
        {status ? (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[#8A8680]">Contrato</dt>
              <dd className="mt-1 font-mono text-foreground">
                {localRpc ? (
                  shortAddress(address)
                ) : (
                  <a className="text-[#8b5cf6] hover:underline" href={`${AMOY_EXPLORER_URL}/address/${address}`}>
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
            void deposit();
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
            void withdraw();
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
      {formMessage ? <p className="text-sm text-[#8b5cf6]">{formMessage}</p> : null}
      {formError ? <p className="text-sm text-[#e11d48]">{formError}</p> : null}

      <section className="rounded-2xl border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-sm tracking-[0.16em] text-foreground">TRADES</h2>
          {listening ? <p className="text-xs font-medium text-[#22d3ee]">En vivo</p> : null}
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
                  <p className="text-sm font-medium tabular-nums text-[#22d3ee]">{formatUsdc(trade.amountOut)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
