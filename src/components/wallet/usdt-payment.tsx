"use client";

import { Copy, Landmark } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { reportUsdtPayment, startUsdtOrder } from "@/app/dashboard/wallet/actions";
import { formatUsd } from "@/lib/format";
import type { UsdtPurpose } from "@/lib/payments/usdt";

export function UsdtPayment({
  purpose,
  amountUsd,
  label,
  note,
}: {
  purpose: UsdtPurpose;
  amountUsd: number;
  label: string;
  note?: string;
}) {
  const [view, setView] = useState<"offer" | "order" | "report" | "submitted">("offer");
  const [pending, setPending] = useState(false);
  const [order, setOrder] = useState<{ orderId: string; companyWallet: string; amountUsd: number } | null>(null);
  const [txid, setTxid] = useState("");

  async function start() {
    setPending(true);
    const result = await startUsdtOrder(purpose);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      setView("offer");
      return;
    }
    setOrder({ orderId: result.orderId, companyWallet: result.companyWallet, amountUsd: result.amountUsd });
    setView("order");
  }

  async function submit() {
    if (!order) return;
    setPending(true);
    const result = await reportUsdtPayment(order.orderId, txid);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setView("submitted");
    toast.success("Pago reportado. LYRA lo validará y activará tu compra.");
  }

  if (view === "submitted" || view === "report") {
    return (
      <div className="mt-5 rounded-2xl bg-[#F7F5F1] p-4 ring-1 ring-[#EFEAE3]">
        <p className="text-sm font-semibold text-[#1E1E24]">
          {view === "submitted" ? "✅ Pago reportado" : "Reporta tu transferencia"}
        </p>
        <p className="mt-1 text-sm leading-6 text-[#5C5854]">
          Envía exactamente <strong>{formatUsd(order?.amountUsd ?? amountUsd)}</strong> en USDT (TRC20) a la wallet de
          LYRA y pega el hash de la transacción (TXID).
        </p>
        {order ? (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(order.companyWallet);
              toast.success("Wallet copiada");
            }}
            className="mt-3 inline-flex w-full items-center gap-2 rounded-lg border border-[#C4B5FD] bg-[#F5F3FF] px-3 py-2.5 text-left font-mono text-sm text-[#5B21B6] hover:bg-[#EDE9FE]"
          >
            <Landmark className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{order.companyWallet}</span>
            <Copy className="size-4 shrink-0 opacity-70" aria-hidden />
          </button>
        ) : null}
        <div className="mt-3">
          <label htmlFor="usdt-txid" className="text-xs text-[#8A8680]">
            Hash de la transferencia (TXID)
          </label>
          <input
            id="usdt-txid"
            value={txid}
            onChange={(event) => setTxid(event.target.value)}
            placeholder="Ej. a1b2c3d4e5f6…"
            className="mt-1 w-full rounded-lg border border-[#E7E2DA] bg-white px-3 py-2 text-sm font-mono text-[#1E1E24] outline-none focus:border-[#7C3AED]"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={pending || txid.trim().length < 8}
            className="rounded-md bg-[#7C3AED] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Enviando…" : "Confirmar transferencia"}
          </button>
          <button
            type="button"
            onClick={() => {
              setView("order");
              setTxid("");
            }}
            className="rounded-md border border-[#E7E2DA] bg-white px-4 py-2 text-sm font-medium text-[#1E1E24]"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  if (view === "order") {
    return (
      <div className="mt-5 rounded-2xl bg-[#F7F5F1] p-4 ring-1 ring-[#EFEAE3]">
        <p className="text-sm font-semibold text-[#1E1E24]">Pago en USDT (TRC20)</p>
        <p className="mt-1 text-sm leading-6 text-[#5C5854]">
          {note ?? `${label} · ${formatUsd(order?.amountUsd ?? amountUsd)}`}. LYRA no cobra comisión por este método.
        </p>
        <button
          type="button"
          onClick={() => setView("report")}
          className="mt-3 w-full rounded-lg bg-[#009EE3] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0088CC]"
        >
          Ya hice la transferencia
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => void start()}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg border border-[#C4B5FD] bg-[#F5F3FF] px-4 py-2.5 text-sm font-semibold text-[#5B21B6] hover:bg-[#EDE9FE] disabled:opacity-60"
      >
        <Landmark className="size-4" aria-hidden />
        {pending ? "Preparando…" : `Pagar ${formatUsd(amountUsd)} en USDT`}
      </button>
    </div>
  );
}