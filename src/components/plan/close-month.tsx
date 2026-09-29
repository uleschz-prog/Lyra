"use client";

import { useState } from "react";
import { toast } from "sonner";

import { closeMonthAction } from "@/app/dashboard/plan/actions";
import { formatUsd } from "@/lib/format";

function monthOptions() {
  const now = new Date();
  return [1, 0].map((back) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    return {
      key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }),
    };
  });
}

export function CloseMonth() {
  const options = monthOptions();
  const [month, setMonth] = useState(options[0].key);
  const [pending, setPending] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  async function close() {
    if (!window.confirm(`¿Cerrar ${options.find((option) => option.key === month)?.label}? Se pagan los bonos del mes una sola vez.`)) return;
    setPending(true);
    const result = await closeMonthAction(month);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const text = `${result.active} de ${result.members} socios activos · ${result.points.toLocaleString("es-MX")} puntos · ${result.payouts} pagos por ${formatUsd(result.paid)}`;
    setSummary(text);
    toast.success(`Mes ${result.month} cerrado`);
  }

  return (
    <section className="rounded-3xl border border-[#1E1E24] bg-white p-6">
      <p className="text-[11px] font-medium tracking-[0.22em] text-[#7C3AED] uppercase">Administración</p>
      <h2 className="mt-2 text-lg font-bold tracking-tight text-[#1E1E24]">Cierre mensual</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5C5854]">
        Paga el Bono Constelación y el Fondo Galaxia sobre la red real. Cada mes se cierra una sola vez. El día 1 corre
        solo con el cierre programado.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setMonth(option.key)}
            className={`rounded-full border px-3 py-1.5 text-sm capitalize ${
              month === option.key ? "border-[#1E1E24] bg-[#1E1E24] text-white" : "border-[#E7E2DA] text-[#5C5854]"
            }`}
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          onClick={close}
          disabled={pending}
          className="rounded-md bg-[#7C3AED] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Cerrando…" : "Cerrar mes"}
        </button>
      </div>
      {summary ? <p className="mt-3 text-sm text-[#1E1E24]">{summary}</p> : null}
    </section>
  );
}
