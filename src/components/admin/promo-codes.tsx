"use client";

import { useState } from "react";
import { Copy, Plus, TicketPercent } from "lucide-react";
import { toast } from "sonner";

import { createPromoCode, listPromoCodes, togglePromoCode, type PromoStats } from "@/app/dashboard/admin/promo-actions";
import { formatUsd } from "@/lib/format";

export function PromoCodes({ initialCodes }: { initialCodes: PromoStats[] }) {
  const [codes, setCodes] = useState<PromoStats[]>(initialCodes);
  const [budget, setBudget] = useState("");
  const [pending, setPending] = useState(false);

  async function refresh() {
    const result = await listPromoCodes();
    if (result.ok) setCodes(result.codes);
  }

  async function create() {
    const amount = Number(budget);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Escribe un presupuesto en USD mayor a cero.");
      return;
    }
    setPending(true);
    const result = await createPromoCode(amount);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Código promocional creado", { description: result.code });
    setBudget("");
    await refresh();
  }

  async function toggle(code: PromoStats) {
    setPending(true);
    const result = await togglePromoCode(code.id, !code.active);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(code.active ? "Código desactivado" : "Código activado", { description: code.code });
    await refresh();
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Código copiado", { description: code });
    } catch {
      toast.error("No se pudo copiar el código.");
    }
  }

  return (
    <section className="rounded-3xl border border-[#DDD6FE] bg-gradient-to-br from-[#F5F3FF] via-white to-[#ECFEFF] p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#7C3AED]/10 text-[#7C3AED]">
          <TicketPercent className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <p className="text-[11px] font-medium tracking-[0.22em] text-[#7C3AED] uppercase">Uso exclusivo del administrador</p>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-[#1E1E24]">Código promocional universal</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5C5854]">
            Cubre <strong>cualquier cuenta</strong> del socio que lo use: membresía de entrada, recompra mensual,
            recarga de créditos o mejora de plan. El pago sale del presupuesto de este código, sin pasar por Mercado
            Pago ni USDT. Cada uso queda registrado con su monto y propósito.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-[#E7E2DA] bg-white px-3 py-2">
          <span className="text-sm text-[#8A8680]">USD</span>
          <input
            value={budget}
            onChange={(event) => setBudget(event.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="Presupuesto, p. ej. 5000"
            inputMode="decimal"
            className="min-w-0 flex-1 bg-transparent text-sm text-[#1E1E24] outline-none"
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          onClick={create}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-[#7C3AED] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {pending ? "Creando…" : "Generar código"}
        </button>
      </div>

      {codes.length === 0 ? (
        <p className="mt-5 rounded-xl bg-white/70 px-4 py-6 text-center text-sm text-[#5C5854]">
          Aún no has generado códigos promocionales.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {codes.map((code) => {
            const pct = code.budgetUsd > 0 ? Math.min(100, Math.round((code.usedUsd / code.budgetUsd) * 100)) : 0;
            return (
              <li key={code.id} className="rounded-2xl border border-[#E7E2DA] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => void copy(code.code)}
                    className="inline-flex items-center gap-2 font-mono text-sm font-semibold text-[#5B21B6] hover:text-[#7C3AED]"
                  >
                    {code.code}
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase ${
                        code.active ? "bg-[#D1FAE5] text-[#059669]" : "bg-[#F1EEE9] text-[#5C5854]"
                      }`}
                    >
                      {code.active ? "Activo" : "Inactivo"}
                    </span>
                    <button
                      type="button"
                      onClick={() => void toggle(code)}
                      disabled={pending}
                      className="rounded-md border border-[#E7E2DA] px-3 py-1 text-xs text-[#1E1E24] disabled:opacity-50"
                    >
                      {code.active ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-[#5C5854]">
                  <span>
                    Usado {formatUsd(code.usedUsd)} de {formatUsd(code.budgetUsd)}
                  </span>
                  <span className="font-medium text-[#059669]">Disponible {formatUsd(code.remainingUsd)}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#F1EEE9]">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A78BFA]" style={{ width: `${Math.max(4, pct)}%` }} />
                </div>
                <p className="mt-2 text-[11px] text-[#8A8680]">{code.uses} uso{code.uses === 1 ? "" : "s"}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
