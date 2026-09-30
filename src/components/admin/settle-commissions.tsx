"use client";

import { useState } from "react";
import { toast } from "sonner";

import { settleCommissions } from "@/app/dashboard/admin/actions";
import { formatUsd } from "@/lib/format";

export function SettleCommissions() {
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  async function settle() {
    if (
      !window.confirm(
        "¿Hacer corte de comisiones? Se marca el saldo de comisiones de cada socio como entregado a su wallet USDT TRC20 y se reinicia su acumulado. Esta acción queda en bitácora.",
      )
    )
      return;
    setPending(true);
    const result = await settleCommissions(note);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const text = `${result.settled} socios · ${formatUsd(result.total)} entregados${
      result.skipped > 0 ? ` · ${result.skipped} sin wallet USDT (revisa sus direcciones)` : ""
    }`;
    setSummary(text);
    setNote("");
    toast.success("Corte de comisiones hecho");
  }

  return (
    <section className="rounded-3xl border border-[#DDD6FE] bg-gradient-to-br from-[#F5F3FF] via-white to-[#ECFEFF] p-6">
      <p className="text-[11px] font-medium tracking-[0.22em] text-[#7C3AED] uppercase">Administración</p>
      <h2 className="mt-2 text-lg font-bold tracking-tight text-[#1E1E24]">Corte de comisiones</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5C5854]">
        Entrega las comisiones acumuladas de cada socio a su wallet <strong>USDT TRC20</strong> y reinicia el saldo
        pendiente. Cada corte queda registrado en la bitácora del socio. Asegúrate de tener las direcciones al día
        antes de cortar.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Nota del corte (opcional): mes, folio…"
          className="min-w-[220px] flex-1 rounded-lg border border-[#E7E2DA] bg-white px-3 py-2 text-sm text-[#1E1E24] outline-none focus:border-[#7C3AED]"
        />
        <button
          type="button"
          onClick={settle}
          disabled={pending}
          className="rounded-md bg-[#7C3AED] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Cortando…" : "Hacer corte de comisiones"}
        </button>
      </div>
      {summary ? <p className="mt-3 text-sm text-[#1E1E24]">{summary}</p> : null}
    </section>
  );
}
