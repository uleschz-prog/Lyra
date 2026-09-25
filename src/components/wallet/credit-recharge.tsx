"use client";

import { useState } from "react";
import { toast } from "sonner";

import { startCheckout } from "@/app/dashboard/wallet/actions";
import { creditRechargeUsd, isFounderPackage } from "@/config/compensation-plan";
import { formatUsd } from "@/lib/format";
import type { MpQuote } from "@/lib/payments/mercadopago";

const money = (value: number, currency: string) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency, minimumFractionDigits: 2 }).format(value);

export function CreditRecharge({
  packageId,
  amount,
  exempt,
  exemptLabel,
  paid,
  remaining,
  quotes,
}: {
  packageId: string;
  amount: number;
  exempt: boolean;
  exemptLabel: string;
  paid: boolean;
  remaining: number;
  quotes: { rebuy: MpQuote | null; credits: MpQuote | null } | null;
}) {
  const founder = isFounderPackage(packageId);
  const extra = creditRechargeUsd(packageId);
  const canRebuy = !exempt && !paid;
  const [purpose, setPurpose] = useState<"rebuy" | "credits" | null>(canRebuy ? "rebuy" : null);
  const [pending, setPending] = useState(false);

  const title = founder ? "Mensualidad Founder" : "Recompra del mes";
  const state = exempt
    ? exemptLabel
    : paid
      ? "Pagada este mes. Tus comisiones siguen activas."
      : `${formatUsd(amount)} para mantenerte activo y cobrar tus bonos.${
          remaining > 0 ? ` Con ${remaining} ${remaining === 1 ? "directo activo más" : "directos activos más"} quedas exento.` : ""
        }`;
  const quote = purpose ? quotes?.[purpose] : null;

  async function pay() {
    if (!purpose) return;
    setPending(true);
    const result = await startCheckout(purpose);
    if (!result.ok) {
      setPending(false);
      toast.error(result.error);
      return;
    }
    window.location.href = result.url;
  }

  return (
    <section className="rounded-2xl border border-border bg-white p-6">
      <p className="text-[11px] font-medium tracking-[0.22em] text-[#5C5854] uppercase">{title}</p>
      <h2 className="mt-2 text-xl text-[#1E1E24]">
        {exempt ? "Exento de recompra" : paid ? "Estás activo este mes" : formatUsd(amount)}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#5C5854]">{state}</p>
      {founder ? <p className="mt-2 text-sm text-[#7C3AED]">Cada mensualidad suma 40 créditos a tu saldo.</p> : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {canRebuy ? (
          <button
            type="button"
            onClick={() => setPurpose("rebuy")}
            className={`rounded-md px-4 py-2.5 text-sm font-medium ${
              purpose === "rebuy" ? "bg-[#312F2F] text-white" : "border border-[#D9D5CE] text-[#1E1E24]"
            }`}
          >
            {founder ? `Mensualidad ${formatUsd(amount)}` : `Recompra ${formatUsd(amount)}`}
          </button>
        ) : null}
        {extra && !founder ? (
          <button
            type="button"
            onClick={() => setPurpose("credits")}
            className={`rounded-md px-4 py-2.5 text-sm font-medium ${
              purpose === "credits" ? "bg-[#312F2F] text-white" : "border border-[#D9D5CE] text-[#1E1E24]"
            }`}
          >
            {extra} créditos extra
          </button>
        ) : null}
      </div>

      {purpose ? (
        quote ? (
          <div className="mt-5 max-w-md rounded-2xl bg-[#F7F5F1] p-4 ring-1 ring-[#EFEAE3]">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4 text-[#5C5854]">
                <dt>{purpose === "rebuy" ? title : `${extra} créditos`} · {formatUsd(quote.usd)}</dt>
                <dd className="tabular-nums">{money(quote.net, quote.currency)}</dd>
              </div>
              <div className="flex justify-between gap-4 text-[#5C5854]">
                <dt>Comisión de Mercado Pago</dt>
                <dd className="tabular-nums">{money(quote.fee, quote.currency)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-[#E7E2DA] pt-2 font-semibold text-[#1E1E24]">
                <dt>Total a pagar</dt>
                <dd className="tabular-nums">{money(quote.total, quote.currency)}</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={pay}
              disabled={pending}
              className="mt-4 flex h-11 w-full items-center justify-center rounded-lg bg-[#009EE3] text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Abriendo Mercado Pago…" : "Pagar con Mercado Pago"}
            </button>
            <p className="mt-2 text-center text-xs text-[#8A8680]">Tarjeta, OXXO o saldo de Mercado Pago. Se activa al acreditarse.</p>
          </div>
        ) : (
          <p className="mt-5 rounded-xl bg-[#F7F5F1] px-4 py-3 text-sm text-[#5C5854]">
            Los pagos con Mercado Pago se habilitan en cuanto LYRA conecte su cuenta.
          </p>
        )
      ) : null}
    </section>
  );
}
