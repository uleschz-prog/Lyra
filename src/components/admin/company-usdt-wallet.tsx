"use client";

import { useState } from "react";
import { toast } from "sonner";

import { saveCompanyUsdtWallet } from "@/app/dashboard/admin/actions";
import { Landmark } from "lucide-react";

export function CompanyUsdtWallet({ address }: { address: string | null }) {
  const [value, setValue] = useState(address ?? "");
  const [pending, setPending] = useState(false);
  const saved = value.trim() === (address ?? "").trim() && Boolean(address);

  async function save() {
    setPending(true);
    const result = await saveCompanyUsdtWallet(value);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.companyUsdtTrc20 ? "Wallet de la empresa guardada" : "Wallet de la empresa removida");
  }

  return (
    <section className="rounded-3xl border border-[#DDD6FE] bg-gradient-to-br from-[#F5F3FF] via-white to-[#FFF7ED] p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#7C3AED]/10 text-[#7C3AED]">
          <Landmark className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <p className="text-[11px] font-medium tracking-[0.22em] text-[#7C3AED] uppercase">Pagos con USDT</p>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-[#1E1E24]">Wallet USDT (TRC20) de LYRA</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5C5854]">
            Dirección Tron que recibe los pagos de <strong>todos los paquetes</strong> (Started, Pro, Founder,
            Corporate y Vega Partner) y de las <strong>recompras y recargas de créditos</strong> de los socios en USDT
            TRC20. Cuando un socio declara haber hecho una transferencia, esta es la cuenta a la que debe llegar.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="T..."
          className="min-w-[260px] flex-1 rounded-lg border border-[#E7E2DA] bg-white px-3 py-2 text-sm text-[#1E1E24] outline-none focus:border-[#7C3AED]"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={save}
          disabled={pending || saved}
          className="rounded-md bg-[#7C3AED] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Guardando…" : saved ? "Guardada ✓" : address ? "Actualizar wallet" : "Guardar wallet"}
        </button>
      </div>
      <p className="mt-2 text-xs text-[#8A8680]">
        Empieza con <code className="rounded bg-[#EDE9FE] px-1">T</code> y tiene 34 caracteres. Red Tron (TRC20) obligatoria.
      </p>
    </section>
  );
}