"use client";

import { Check, HandCoins } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { markAcademyCreatorPayoutPaid } from "@/app/dashboard/admin/actions";

export type AcademyCreatorPayoutRow = {
  id: string;
  totalAmount: number;
  creatorAmount: number;
  currency: string;
  paidAt: string;
  courseTitle: string;
  creatorName: string;
  creatorUsername: string;
  buyerName: string;
  reference?: string | null;
};

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

export function AcademyCreatorPayouts({
  initialPayouts,
  recentPayouts,
}: {
  initialPayouts: AcademyCreatorPayoutRow[];
  recentPayouts: AcademyCreatorPayoutRow[];
}) {
  const router = useRouter();
  const [references, setReferences] = useState<Record<string, string>>({});
  const [busy, startTransition] = useTransition();

  function markPaid(payout: AcademyCreatorPayoutRow) {
    if (!window.confirm(`¿Confirmas que ya transferiste ${money(payout.creatorAmount, payout.currency)} a ${payout.creatorName}?`)) {
      return;
    }
    startTransition(async () => {
      const result = await markAcademyCreatorPayoutPaid(payout.id, references[payout.id] ?? "");
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Pago del creador registrado");
      router.refresh();
    });
  }

  return (
    <section className="rounded-3xl border border-[#DDD6FE] bg-gradient-to-br from-[#F5F3FF] via-white to-[#ECFEFF] p-6">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#7C3AED]/10 text-[#7C3AED]">
          <HandCoins className="size-5" aria-hidden />
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#7C3AED]">Academia · liquidaciones</p>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-[#1E1E24]">Pagos manuales a creadores</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5C5854]">
            Los cobros se reciben en Mercado Pago de LYRA. Registra aquí cada transferencia manual del 93% correspondiente
            al creador; la comisión de procesamiento la absorbe LYRA.
          </p>
        </div>
      </div>

      {initialPayouts.length === 0 ? (
        <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          No hay pagos a creadores pendientes.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs text-[#77716A]">
              <tr>
                <th className="pb-2 pr-4 font-medium">Creador / curso</th>
                <th className="pb-2 pr-4 font-medium">Alumno</th>
                <th className="pb-2 pr-4 font-medium">Venta</th>
                <th className="pb-2 pr-4 font-medium">Pago al creador · 93%</th>
                <th className="pb-2 pr-4 font-medium">Referencia</th>
                <th className="pb-2 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7E2DA] text-[#312F2F]">
              {initialPayouts.map((payout) => (
                <tr key={payout.id}>
                  <td className="py-3 pr-4">
                    <p className="font-medium">{payout.creatorName}</p>
                    <p className="text-xs text-[#8A8680]">@{payout.creatorUsername} · {payout.courseTitle}</p>
                    <p className="text-xs text-[#8A8680]">Cobrado {new Date(payout.paidAt).toLocaleDateString("es-MX")}</p>
                  </td>
                  <td className="py-3 pr-4">{payout.buyerName}</td>
                  <td className="py-3 pr-4 tabular-nums">{money(payout.totalAmount, payout.currency)}</td>
                  <td className="py-3 pr-4 font-semibold tabular-nums">{money(payout.creatorAmount, payout.currency)}</td>
                  <td className="py-3 pr-4">
                    <input
                      aria-label={`Referencia de transferencia a ${payout.creatorName}`}
                      maxLength={160}
                      placeholder="Opcional"
                      value={references[payout.id] ?? ""}
                      onChange={(event) => setReferences((current) => ({ ...current, [payout.id]: event.target.value }))}
                      className="h-9 w-36 rounded-lg border border-[#D6D3D1] bg-white px-2 text-xs text-[#1E1E24] outline-none focus:border-violet-500"
                    />
                  </td>
                  <td className="py-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => markPaid(payout)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#067647] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      <Check className="size-4" aria-hidden />
                      Registrar pago
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {recentPayouts.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-[#1E1E24]">Transferencias registradas recientemente</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-[#77716A]">
                <tr>
                  <th className="pb-2 pr-4 font-medium">Creador / curso</th>
                  <th className="pb-2 pr-4 font-medium">Alumno</th>
                  <th className="pb-2 pr-4 font-medium">Monto</th>
                  <th className="pb-2 pr-4 font-medium">Fecha</th>
                  <th className="pb-2 font-medium">Referencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7E2DA] text-[#312F2F]">
                {recentPayouts.map((payout) => (
                  <tr key={payout.id}>
                    <td className="py-3 pr-4">
                      <p className="font-medium">{payout.creatorName}</p>
                      <p className="text-xs text-[#8A8680]">@{payout.creatorUsername} · {payout.courseTitle}</p>
                    </td>
                    <td className="py-3 pr-4">{payout.buyerName}</td>
                    <td className="py-3 pr-4 font-semibold tabular-nums">{money(payout.creatorAmount, payout.currency)}</td>
                    <td className="py-3 pr-4">{new Date(payout.paidAt).toLocaleDateString("es-MX")}</td>
                    <td className="py-3 pr-4 text-xs">{payout.reference || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
