"use client";

import { Check, Landmark, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { approveUsdtOrder, rejectUsdtOrder } from "@/app/dashboard/admin/actions";
import { getPendingUsdtOrders } from "@/app/dashboard/wallet/actions";
import { formatUsd } from "@/lib/format";

type OrderRow = {
  id: string;
  purpose: string;
  amountUsd: number;
  trxHash: string | null;
  createdAt: string;
  userName: string;
};

const purposeLabel: Record<string, string> = {
  signup: "Membresía nueva",
  rebuy: "Recompra del mes",
  credits: "Recarga de créditos",
};

export function UsdtOrders({ initialOrders }: { initialOrders: OrderRow[] }) {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRow[]>(initialOrders);
  const [busy, startTransition] = useTransition();
  const [openedId, setOpenedId] = useState<string | null>(null);

  function refresh() {
    startTransition(async () => {
      const result = await getPendingUsdtOrders();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setOrders(result.orders);
      router.refresh();
    });
  }

  function decide(id: string, approve: boolean, userName: string) {
    if (approve && !window.confirm(`¿Confirmar el pago USDT de ${userName}? Se activa su compra y se liberan los créditos/bonos.`)) return;
    if (!approve && !window.confirm(`¿Rechazar el pago USDT de ${userName}?`)) return;
    startTransition(async () => {
      const result = approve ? await approveUsdtOrder(id) : await rejectUsdtOrder(id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(approve ? "Pago aprobado y compra activada" : "Pago rechazado");
      refresh();
    });
  }

  if (orders.length === 0) {
    return (
      <section className="rounded-3xl border border-[#E7E2DA] bg-white p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#7C3AED]/10 text-[#7C3AED]">
            <Landmark className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="text-[11px] font-medium tracking-[0.22em] text-[#7C3AED] uppercase">Pagos USDT por validar</p>
            <h2 className="mt-1 text-lg font-bold tracking-tight text-[#1E1E24]">Sin transferencias pendientes</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5C5854]">
              Cuando un socio reporte haber enviado USDT TRC20 a la wallet de la empresa, aparecerá aquí para que la
              valides: apruebas el pago y se activa su membresía, recompra o recarga al instante.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-[#DDD6FE] bg-gradient-to-br from-[#F5F3FF] via-white to-[#ECFEFF] p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#7C3AED]/10 text-[#7C3AED]">
            <Landmark className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="text-[11px] font-medium tracking-[0.22em] text-[#7C3AED] uppercase">Pagos USDT por validar</p>
            <h2 className="mt-1 text-lg font-bold tracking-tight text-[#1E1E24]">
              {orders.length} {orders.length === 1 ? "transferencia" : "transferencias"} esperando validación
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5C5854]">
              Verifica en TronScan que el monto llegó a la wallet de LYRA antes de aprobar. La aprobación activa la
              compra del socio.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          className="rounded-md border border-[#E7E2DA] bg-white px-3 py-1.5 text-sm text-[#1E1E24] disabled:opacity-50"
        >
          {busy ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      <ul className="mt-4 space-y-3">
        {orders.map((order) => (
          <li key={order.id} className="rounded-2xl border border-[#E7E2DA] bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#1E1E24]">
                  {order.userName} · {purposeLabel[order.purpose] ?? order.purpose}
                </p>
                <p className="mt-0.5 text-sm text-[#5C5854]">
                  {formatUsd(order.amountUsd)} en USDT (TRC20)
                </p>
                <p className="mt-1 text-xs text-[#8A8680]">
                  Reportada {new Date(order.createdAt).toLocaleString("es-MX")} · TXID:{" "}
                  <span className="font-mono">{order.trxHash ?? "—"}</span>
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => decide(order.id, true, order.userName)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#067647] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  <Check className="size-4" aria-hidden />
                  Aprobar
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => decide(order.id, false, order.userName)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#FDA29B] bg-white px-3 py-2 text-sm font-medium text-[#B42318] disabled:opacity-50"
                >
                  <X className="size-4" aria-hidden />
                  Rechazar
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpenedId(openedId === order.id ? null : order.id)}
              className="mt-2 text-xs text-[#7C3AED] underline-offset-2 hover:underline"
            >
              {openedId === order.id ? "Ocultar" : "Ver detalle de la orden"}
            </button>
            {openedId === order.id ? (
              <div className="mt-3 rounded-xl bg-[#F7F5F1] p-3 text-sm text-[#5C5854]">
                <p>
                  <strong>Cliente:</strong> {order.userName}
                </p>
                <p>
                  <strong>Concepto:</strong> {purposeLabel[order.purpose] ?? order.purpose}
                </p>
                <p>
                  <strong>Monto:</strong> {formatUsd(order.amountUsd)}
                </p>
                <p>
                  <strong>TXID:</strong> <span className="font-mono break-all">{order.trxHash ?? "—"}</span>
                </p>
                <p>
                  <strong>Fecha:</strong> {new Date(order.createdAt).toLocaleString("es-MX")}
                </p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}