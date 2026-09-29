"use client";

import { useState } from "react";
import { toast } from "sonner";

import { startCheckout } from "@/app/dashboard/wallet/actions";

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
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-[#1E1E24] to-[#3B2A6B] px-5 py-4 text-white">
      <div>
        <p className="text-sm font-semibold">Activa tu membresía {label}</p>
        <p className="mt-0.5 text-sm text-white/75">
          Completa tu pago de ${price.toLocaleString("en-US")} USD para recibir tus créditos y empezar a ganar comisiones.
        </p>
      </div>
      <button
        type="button"
        onClick={pay}
        disabled={pending}
        className="rounded-lg bg-[#009EE3] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Abriendo Mercado Pago…" : "Pagar con Mercado Pago"}
      </button>
    </div>
  );
}
