"use client";

import { useState } from "react";
import { toast } from "sonner";

import { startCheckout } from "@/app/dashboard/wallet/actions";
import { UsdtPayment } from "@/components/wallet/usdt-payment";

export function PendingMembership({ label, price }: { label: string; price: number }) {
  const [pending, setPending] = useState(false);

  async function pay() {
    setPending(true);
    const result = await startCheckout("signup");
    if (!result.ok) {
      setPending(false);
      toast.error(result.error);
      return;
    }
    window.location.href = result.url;
  }

  return (
    <div className="mb-6 flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-[#1E1E24] to-[#3B2A6B] px-5 py-4 text-white lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-sm font-semibold">Activa tu membresía {label}</p>
        <p className="mt-0.5 text-sm text-white/75">
          Completa tu pago de ${price.toLocaleString("en-US")} USD para recibir tus créditos y empezar a ganar
          comisiones.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={pay}
          disabled={pending}
          className="rounded-lg bg-[#009EE3] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Abriendo Mercado Pago…" : "Pagar con Mercado Pago"}
        </button>
        <div className="rounded-lg bg-white/5 px-3 py-1.5">
          <UsdtPayment purpose="signup" amountUsd={price} label={`Membresía ${label}`} />
        </div>
      </div>
    </div>
  );
}
