"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { quoteCreditRecharge, startCheckout } from "@/app/dashboard/wallet/actions";
import {
  creditedRechargeCredits,
  creditRechargeUsdForCredits,
  hasActiveMembership,
  isValidCreditRecharge,
  minimumCreditRecharge,
  promotionalRechargeCredits,
} from "@/config/compensation-plan";
import { formatUsd } from "@/lib/format";
import type { MpQuote } from "@/lib/payments/mercadopago";
import { UsdtPayment } from "@/components/wallet/usdt-payment";

const money = (value: number, currency: string) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency, minimumFractionDigits: 2 }).format(value);

export function CreditRecharge({
  packageId,
  activeThisMonth,
  mercadoPagoEnabled,
  initialQuote,
}: {
  packageId: string;
  activeThisMonth: boolean;
  mercadoPagoEnabled: boolean;
  initialQuote: MpQuote | null;
}) {
  const [draft, setDraft] = useState(String(minimumCreditRecharge));
  const [quoteState, setQuoteState] = useState<{
    credits: number;
    quote: MpQuote | null;
    status: "idle" | "loading" | "ready" | "error";
  }>({
    credits: minimumCreditRecharge,
    quote: initialQuote,
    status: initialQuote ? "ready" : "idle",
  });
  const [pending, setPending] = useState(false);
  const credits = Number(draft);
  const valid = isValidCreditRecharge(credits);
  const canRecharge = hasActiveMembership(packageId);
  const amountUsd = valid ? creditRechargeUsdForCredits(credits) : 0;
  const credited = valid ? creditedRechargeCredits(credits) : 0;
  const hasPromo = valid && credits === promotionalRechargeCredits;
  const hasCurrentQuote = valid && canRecharge && quoteState.credits === credits;
  const quote = hasCurrentQuote ? quoteState.quote : null;
  const quotePending =
    mercadoPagoEnabled &&
    valid &&
    canRecharge &&
    (!hasCurrentQuote || quoteState.status === "idle" || quoteState.status === "loading");

  useEffect(() => {
    if (!valid || !canRecharge || !mercadoPagoEnabled) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setQuoteState({ credits, quote: null, status: "loading" });
      void quoteCreditRecharge(credits)
        .then((next) => {
          if (active) setQuoteState({ credits, quote: next, status: next ? "ready" : "error" });
        })
        .catch(() => {
          if (active) setQuoteState({ credits, quote: null, status: "error" });
        });
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [canRecharge, credits, mercadoPagoEnabled, valid]);

  async function pay() {
    if (!valid || !canRecharge || pending) return;
    setPending(true);
    const result = await startCheckout("credits", credits);
    if (!result.ok) {
      setPending(false);
      toast.error(result.error);
      return;
    }
    window.location.href = result.url;
  }

  return (
    <section className="relative overflow-hidden rounded-3xl border border-[#DDD6FE] bg-gradient-to-br from-[#F5F3FF] via-white to-[#ECFEFF] p-5 sm:p-7 dark:border-white/12 dark:from-[#181625] dark:via-[#14121C] dark:to-[#181625]">
      <div className="pointer-events-none absolute -top-20 right-0 size-56 rounded-full bg-[#7C3AED]/10 blur-3xl" aria-hidden />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.2em] text-[#7C3AED] uppercase">Créditos LYRA</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#1E1E24] dark:text-[#F2F0F7]">Recarga a tu ritmo</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5C5854] dark:text-[#9B96AC]">
              Elige una cantidad desde {minimumCreditRecharge} créditos. Cada crédito cuesta 1 USD; una recarga mensual desde el mínimo mantiene tu actividad para cobrar comisiones.
            </p>
          </div>
          {activeThisMonth ? (
            <span className="rounded-full bg-[#E8F7EE] px-3 py-1.5 text-xs font-semibold text-[#067647] dark:bg-emerald-950/50 dark:text-emerald-300">
              Actividad del mes cubierta
            </span>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
          <div className="rounded-2xl border border-[#E7E2DA] bg-white/85 p-4 dark:border-white/10 dark:bg-[#14121C]/75">
            <label htmlFor="credit-recharge-amount" className="text-sm font-semibold text-[#1E1E24] dark:text-[#F2F0F7]">
              ¿Cuántos créditos necesitas?
            </label>
            <div className="mt-2 flex items-center gap-3">
              <input
                id="credit-recharge-amount"
                type="number"
                min={minimumCreditRecharge}
                step={1}
                inputMode="numeric"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="h-12 w-full max-w-[190px] rounded-xl border border-[#D9D5CE] bg-white px-4 text-xl font-semibold text-[#1E1E24] outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/15 dark:border-white/15 dark:bg-[#181625] dark:text-[#F2F0F7]"
                aria-describedby="credit-recharge-hint"
              />
              <span className="text-sm text-[#5C5854] dark:text-[#9B96AC]">créditos</span>
            </div>
            <p id="credit-recharge-hint" className="mt-2 text-xs text-[#8A8680]">
              Mínimo {minimumCreditRecharge}. Puedes elegir cualquier cantidad entera.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[minimumCreditRecharge, 25, promotionalRechargeCredits].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDraft(String(preset))}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    credits === preset
                      ? "border-[#7C3AED] bg-[#F5F3FF] text-[#5B21B6] dark:border-[#7C3AED] dark:bg-[#30254A] dark:text-[#E9D5FF]"
                      : "border-[#E7E2DA] text-[#5C5854] hover:border-[#C4B5FD] dark:border-white/12 dark:text-[#C7C2D3]"
                  }`}
                >
                  {preset} créditos
                </button>
              ))}
            </div>
            {!valid ? <p className="mt-3 text-sm text-[#B42318]">Ingresa al menos {minimumCreditRecharge} créditos enteros.</p> : null}
            {!canRecharge ? <p className="mt-3 text-sm text-[#B42318]">Activa una membresía para poder recargar.</p> : null}
          </div>

          <div className="rounded-2xl bg-[#1E1E24] p-4 text-white shadow-lg shadow-[#1E1E24]/10 dark:bg-[#0C0A12]">
            <p className="text-xs font-medium tracking-wide text-white/60 uppercase">Resumen de recarga</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <span className="text-sm text-white/75">A recibir</span>
              <span className="text-3xl font-bold tabular-nums">{valid ? credited.toLocaleString("es-MX") : "—"}</span>
            </div>
            <p className="mt-1 text-right text-xs text-white/60">créditos</p>
            <div className="mt-4 flex justify-between border-t border-white/15 pt-3 text-sm">
              <span className="text-white/70">A pagar</span>
              <span className="font-semibold tabular-nums">{valid ? formatUsd(amountUsd) : "—"} USD</span>
            </div>
            {hasPromo ? (
              <p className="mt-3 rounded-xl bg-[#7C3AED]/25 px-3 py-2 text-sm font-medium text-[#E9D5FF]">
                Promo activa: 50 + 10 de regalo
              </p>
            ) : null}
            {valid && quote ? (
              <p className="mt-2 text-xs text-white/55">
                Mercado Pago: {money(quote.total, quote.currency)} con comisión incluida
              </p>
            ) : quotePending && valid ? (
              <p className="mt-2 text-xs text-white/55">Calculando total de Mercado Pago…</p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void pay()}
            disabled={!valid || !canRecharge || pending || quotePending || !quote}
            className="flex h-11 min-w-56 items-center justify-center rounded-xl bg-[#009EE3] px-5 text-sm font-semibold text-white transition hover:bg-[#0088CC] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending
              ? "Abriendo Mercado Pago…"
              : !mercadoPagoEnabled
                ? "Mercado Pago no disponible"
                : quotePending
                  ? "Calculando total…"
                  : quote
                    ? `Pagar ${formatUsd(amountUsd)} con Mercado Pago`
                    : "Cotización no disponible"}
          </button>
          <p className="text-xs text-[#8A8680]">
            {quote
              ? "Tarjeta, OXXO o saldo de Mercado Pago. Se acredita al confirmarse."
              : "Si Mercado Pago no está disponible, paga la misma cantidad en USDT TRC20."}
          </p>
        </div>
        <div className="my-4 flex max-w-xl items-center gap-3">
          <span className="h-px flex-1 bg-[#E7E2DA] dark:bg-white/10" aria-hidden />
          <span className="text-xs text-[#8A8680]">o paga sin comisión de LYRA</span>
          <span className="h-px flex-1 bg-[#E7E2DA] dark:bg-white/10" aria-hidden />
        </div>
        {valid && canRecharge ? (
          <UsdtPayment
            purpose="credits"
            credits={credits}
            amountUsd={amountUsd}
            label={`${credited.toLocaleString("es-MX")} créditos`}
            note={`${credited.toLocaleString("es-MX")} créditos por ${formatUsd(amountUsd)} en USDT (TRC20).`}
          />
        ) : null}
      </div>
    </section>
  );
}
