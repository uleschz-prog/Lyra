"use client";

import { formatUnits } from "viem";

import { Button } from "@/components/ui/button";
import { VegaMark } from "@/components/vega/vega-mark";
import { AMOY_CHAIN_ID, AMOY_EXPLORER_URL } from "@/lib/protocol/autonomous-agent";
import { agentFaceLabel } from "@/lib/protocol/agent-face";
import { formatEthUsd, formatUsdc, formatWeth } from "@/lib/protocol/trade-event";
import { useLyraAgent } from "@/hooks/useLyraAgent";

const METAMASK_INSTALL = "https://metamask.io/download/";

const fieldClass =
  "mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#16141F] px-3 text-sm text-[#F4F1EC] outline-none focus:border-[#A78BFA]";

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

function cooldownCaption(seconds: bigint) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return "Entre ejecuciones";
  if (total % 3600 === 0) {
    const hours = total / 3600;
    return hours === 1 ? "1 hora entre ejecuciones" : `${hours} horas entre ejecuciones`;
  }
  if (total % 60 === 0) {
    const minutes = total / 60;
    return minutes === 1 ? "1 minuto entre ejecuciones" : `${minutes} minutos entre ejecuciones`;
  }
  return `${total} segundos entre ejecuciones`;
}

function formatPol(value: bigint) {
  const amount = Number(formatUnits(value, 18));
  return `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 4 }).format(amount)} POL`;
}

const desk = [
  {
    title: "Oráculo",
    text: "Chainlink ETH/USD en Amoy. El agente no opera con un precio en cero o vencido.",
  },
  {
    title: "Agente",
    text: "Intercambia USDC y WETH en su mercado. La ganancia es el USDC que supera a Chainlink.",
  },
  {
    title: "Keeper",
    text: "Una tarea propia llama executeStrategy solo si hay spread y el agente está activo.",
  },
  {
    title: "Custodia",
    text: "Depositar y retirar exige la billetera owner. Pausar y activar lo haces desde aquí.",
  },
] as const;

export function AutonomousProtocol({ canControl = false }: { canControl?: boolean }) {
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
    setAgentPaused,
    walletPhase,
    account,
    walletUsdc,
    walletPol,
    connecting,
    onAmoy,
    isOwner,
    connectWallet,
    disconnectWallet,
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
  const ethUsd = status?.ethPrice != null ? formatEthUsd(status.ethPrice, status.feedDecimals) : null;
  const contractHref = `${AMOY_EXPLORER_URL}/address/${address}`;

  return (
    <div className="overflow-hidden rounded-[28px] border border-[#2A2438] bg-[#0C0B12] text-[#F4F1EC] shadow-[0_30px_80px_-48px_rgba(124,58,237,0.8)]">
      <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.28),transparent_42%),linear-gradient(180deg,#14121C,#0C0B12)] px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.28em] text-[#A78BFA] uppercase">Protocolo on-chain</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Lyra Web3</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#B7B1C8]">
              El agente intercambia USDC de verdad contra su mercado cuando el precio se separa de Chainlink. Puedes pausarlo o volver a activarlo cuando quieras.
            </p>
            <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#D6D1E4]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#34D399]" />
              Polygon Amoy · chainId {AMOY_CHAIN_ID}
              {listening ? <span className="text-[#22D3EE]">· en vivo</span> : null}
            </p>
          </div>
          <WalletConnect
            phase={walletPhase}
            account={account}
            connecting={connecting}
            onAmoy={onAmoy}
            isOwner={isOwner}
            onConnect={() => void connectWallet(false)}
            onSwitch={() => void connectWallet(true)}
            onDisconnect={disconnectWallet}
          />
        </div>
      </div>

      <div className="grid gap-px bg-white/10 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Custodia USDC"
          value={status ? formatUsdc(status.balance) : "…"}
          hint={
            status?.paused
              ? "Pausado: no opera"
              : status?.canExec
                ? "Hay spread: el keeper puede ejecutar"
                : "Esperando spread o cooldown"
          }
        />
        <Metric label="ETH / USD" value={ethUsd ?? "…"} hint="Chainlink en Amoy" />
        <Metric label="Siguiente ejecución" value={status ? formatRemaining(remaining) : "…"} hint={status ? cooldownCaption(status.cooldown) : "Entre ejecuciones"} />
        <Metric label="Trades" value={String(trades.length)} hint={listening ? "Escuchando StrategyExecuted" : "Sincronizando la red"} />
      </div>

      <section className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <p className={`text-[11px] font-medium tracking-[0.22em] uppercase ${status?.paused ? "text-[#FCD34D]" : "text-[#6EE7B7]"}`}>
            {status ? (status.paused ? "Pausado" : "Activo") : "Leyendo"}
          </p>
          <p className="mt-1 max-w-xl text-sm leading-6 text-[#B7B1C8]">
            {status?.paused
              ? "El agente está pausado. No intercambia hasta que lo actives."
              : "El agente está activo. Pausarlo detiene el siguiente intercambio al momento."}
            {status ? ` WETH en custodia: ${formatWeth(status.wethBalance)}.` : ""}
          </p>
        </div>
        {canControl ? (
          <button
            type="button"
            disabled={!status || busy !== null}
            onClick={() => void setAgentPaused(!status?.paused)}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-white/15 px-4 text-sm font-medium text-[#F4F1EC] hover:border-[#A78BFA] disabled:opacity-60"
          >
            {busy === "control" ? "Enviando…" : status?.paused ? "Activar agente" : "Pausar agente"}
          </button>
        ) : null}
      </section>

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#14121C] px-6 py-8 text-center">
          <VegaMark className="size-32" mood={vegaMood} thinking={thinking} />
          <p className="sr-only">{agentFaceLabel(face)}</p>
          <p className="mt-4 max-w-sm text-sm leading-6 text-[#D6D1E4]" aria-live="polite">
            {lastLog ??
              (status?.paused
                ? "El agente está pausado. Actívalo para que vuelva a intercambiar."
                : "El agente espera un spread real. Cuando el intercambio ocurre, Vega lo muestra aquí.")}
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#14121C] p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[11px] font-medium tracking-[0.22em] text-[#A78BFA] uppercase">Tu MetaMask</h3>
            {isOwner ? <span className="rounded-full bg-[#34D399]/15 px-2 py-1 text-[10px] tracking-[0.14em] text-[#6EE7B7] uppercase">Custodia</span> : null}
          </div>
          {account ? (
            <div className="mt-4 space-y-3">
              <p className="font-mono text-lg text-[#F4F1EC]">{shortAddress(account)}</p>
              <p className="text-sm text-[#B7B1C8]">{onAmoy ? "Red lista: Polygon Amoy." : "Esta cuenta está en otra red. Conectar de nuevo te pide Amoy."}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white/5 px-3 py-2">
                  <p className="text-[10px] tracking-[0.16em] text-[#8E879E] uppercase">USDC</p>
                  <p className="mt-1 text-sm tabular-nums">{walletUsdc != null ? formatUsdc(walletUsdc) : "…"}</p>
                </div>
                <div className="rounded-xl bg-white/5 px-3 py-2">
                  <p className="text-[10px] tracking-[0.16em] text-[#8E879E] uppercase">Gas</p>
                  <p className="mt-1 text-sm tabular-nums">{walletPol != null ? formatPol(walletPol) : "…"}</p>
                </div>
              </div>
              <p className="text-sm leading-6 text-[#B7B1C8]">
                {isOwner
                  ? "Esta cuenta es la custodia. Desde aquí apruebas USDC y lo mueves al agente."
                  : status
                    ? `Esta cuenta observa el protocolo. La custodia es ${shortAddress(status.owner)}.`
                    : "Esta cuenta observa el protocolo."}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-[#B7B1C8]">
              {walletPhase === "checking"
                ? "Buscando MetaMask en este navegador…"
                : walletPhase === "absent"
                  ? "MetaMask no respondió. Instálala, ábrela y pulsa Reintentar. La conexión usa la extensión, no un inicio de sesión de LYRA."
                  : "MetaMask está en el navegador. Conéctala para ver tu dirección, tu USDC y la red Amoy."}
            </p>
          )}
          {formError ? <p className="mt-3 text-sm text-[#FB7185]">{formError}</p> : null}
          {formMessage ? <p className="mt-3 text-sm text-[#C4B5FD]">{formMessage}</p> : null}
        </section>
      </div>

      <section className="grid gap-4 px-4 pb-2 sm:px-6 md:grid-cols-2">
        <form
          className="rounded-2xl border border-white/10 bg-[#14121C] p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!account) {
              void connectWallet(false);
              return;
            }
            void deposit();
          }}
        >
          <h3 className="text-[11px] font-medium tracking-[0.22em] text-[#A78BFA] uppercase">Depósito</h3>
          <p className="mt-2 text-sm leading-6 text-[#B7B1C8]">La custodia aprueba el USDC del contrato y lo deja en el agente.</p>
          <label className="mt-4 block text-sm">
            Cantidad USDC
            <input inputMode="decimal" value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} className={fieldClass} placeholder="1000" />
          </label>
          <Button type="submit" className="mt-4" disabled={busy !== null || !status || connecting}>
            {busy === "deposit" ? "Depositando…" : account ? "Depositar" : "Conectar para depositar"}
          </Button>
        </form>
        <form
          className="rounded-2xl border border-white/10 bg-[#14121C] p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!account) {
              void connectWallet(false);
              return;
            }
            void withdraw();
          }}
        >
          <h3 className="text-[11px] font-medium tracking-[0.22em] text-[#A78BFA] uppercase">Retiro</h3>
          <p className="mt-2 text-sm leading-6 text-[#B7B1C8]">Solo la custodia, y nunca por encima del saldo del agente.</p>
          <label className="mt-4 block text-sm">
            Cantidad USDC
            <input inputMode="decimal" value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} className={fieldClass} placeholder="100" />
          </label>
          <Button type="submit" variant="secondary" className="mt-4" disabled={busy !== null || !status || connecting}>
            {busy === "withdraw" ? "Retirando…" : account ? "Retirar" : "Conectar para retirar"}
          </Button>
        </form>
      </section>

      <section className="px-4 py-4 sm:px-6">
        <h3 className="text-[11px] font-medium tracking-[0.22em] text-[#8E879E] uppercase">Mesa del protocolo</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {desk.map((item) => (
            <article key={item.title} className="rounded-2xl border border-white/10 bg-[#14121C] p-4">
              <p className="text-sm font-medium text-[#F4F1EC]">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-[#B7B1C8]">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-4 mb-4 rounded-2xl border border-white/10 bg-[#14121C] sm:mx-6 sm:mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <h3 className="text-[11px] font-medium tracking-[0.22em] text-[#A78BFA] uppercase">Estado en cadena</h3>
          {listening ? <p className="text-xs font-medium text-[#22D3EE]">En vivo</p> : null}
        </div>
        {statusError ? <p className="px-5 py-4 text-sm text-[#FB7185]">{statusError}</p> : null}
        {status ? (
          <dl className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[#8E879E]">Contrato</dt>
              <dd className="mt-1 font-mono">
                {localRpc ? shortAddress(address) : <a className="text-[#C4B5FD] hover:underline" href={contractHref}>{shortAddress(address)}</a>}
              </dd>
            </div>
            <div>
              <dt className="text-[#8E879E]">Custodia</dt>
              <dd className="mt-1 font-mono">{shortAddress(status.owner)}</dd>
            </div>
            <div>
              <dt className="text-[#8E879E]">USDC</dt>
              <dd className="mt-1 font-mono">{shortAddress(status.usdc)}</dd>
            </div>
            <div>
              <dt className="text-[#8E879E]">Última ejecución</dt>
              <dd className="mt-1">{status.lastExecutionTime === BigInt(0) ? "Aún no corre" : formatTradeTime(status.lastExecutionTime)}</dd>
            </div>
          </dl>
        ) : (
          <p className="px-5 py-4 text-sm text-[#B7B1C8]">Leyendo el protocolo…</p>
        )}
        <div className="border-t border-white/10 px-5 py-4">
          <h3 className="text-[11px] font-medium tracking-[0.22em] text-[#8E879E] uppercase">Trades</h3>
          {tradeError && trades.length === 0 ? (
            <p className="mt-3 text-sm text-[#B7B1C8]">No se pudo leer la red. Revisa la dirección y el RPC.</p>
          ) : trades.length === 0 ? (
            <p className="mt-3 text-sm text-[#B7B1C8]">Todavía no hay trades. Cuando el intercambio mueve USDC, aparecen aquí.</p>
          ) : (
            <ul className="mt-2">
              {trades.map((trade) => (
                <li key={trade.id} className="grid gap-1 border-b border-white/10 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div>
                    <p className="text-sm font-medium">{trade.action}</p>
                    <p className="text-xs text-[#8E879E]">{formatTradeTime(trade.timestamp)}</p>
                  </div>
                  <p className="text-sm font-medium tabular-nums text-[#22D3EE]">{formatUsdc(trade.profit)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="bg-[#100F16] px-4 py-4 sm:px-5">
      <p className="text-[10px] tracking-[0.18em] text-[#8E879E] uppercase">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums text-[#F4F1EC] sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs leading-5 text-[#B7B1C8]">{hint}</p>
    </article>
  );
}

function WalletConnect({
  phase,
  account,
  connecting,
  onAmoy,
  isOwner,
  onConnect,
  onSwitch,
  onDisconnect,
}: {
  phase: "checking" | "absent" | "available" | "connected";
  account: string | null;
  connecting: boolean;
  onAmoy: boolean;
  isOwner: boolean;
  onConnect: () => void;
  onSwitch: () => void;
  onDisconnect: () => void;
}) {
  if (account) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-2 rounded-2xl border border-white/10 bg-black/30 p-3 lg:w-[280px]">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-sm">{shortAddress(account)}</p>
          <span className={`rounded-full px-2 py-0.5 text-[10px] tracking-[0.12em] uppercase ${onAmoy ? "bg-[#34D399]/15 text-[#6EE7B7]" : "bg-[#FBBF24]/15 text-[#FCD34D]"}`}>
            {onAmoy ? "Amoy" : "Otra red"}
          </span>
        </div>
        <p className="text-xs text-[#B7B1C8]">{isOwner ? "Custodia conectada" : "Billetera conectada"}</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onSwitch} className="rounded-xl border border-white/10 px-2 py-2 text-xs text-[#F4F1EC] hover:border-[#A78BFA]">
            Cambiar cuenta
          </button>
          <button type="button" onClick={onDisconnect} className="rounded-xl border border-white/10 px-2 py-2 text-xs text-[#F4F1EC] hover:border-[#A78BFA]">
            Desconectar
          </button>
        </div>
      </div>
    );
  }

  if (phase === "absent") {
    return (
      <div className="flex w-full flex-col gap-2 lg:w-[280px]">
        <a href={METAMASK_INSTALL} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-xl bg-[#F6851B] px-4 py-3 text-sm font-medium text-[#1A1208]">
          Instalar MetaMask
        </a>
        <button type="button" onClick={onConnect} disabled={connecting} className="rounded-xl border border-white/15 px-4 py-3 text-sm text-[#F4F1EC] disabled:opacity-60">
          {connecting ? "Buscando…" : "Reintentar"}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onConnect}
      disabled={connecting || phase === "checking"}
      className="inline-flex w-full items-center justify-center rounded-xl bg-[#F6851B] px-4 py-3 text-sm font-medium text-[#1A1208] disabled:opacity-60 lg:w-auto"
    >
      {phase === "checking" ? "Buscando MetaMask…" : connecting ? "Abriendo MetaMask…" : "Conectar MetaMask"}
    </button>
  );
}
