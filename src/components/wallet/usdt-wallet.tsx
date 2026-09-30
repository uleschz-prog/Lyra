"use client";

import { Wallet } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { saveUsdtWallet } from "@/app/dashboard/wallet/actions";

export function UsdtWallet({ address }: { address: string | null }) {
  const [value, setValue] = useState(address ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await saveUsdtWallet(value);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.usdtTrc20 ? "Wallet USDT guardada" : "Wallet USDT eliminada");
    });
  }

  const dirty = value.trim() !== (address ?? "");
  const saved = Boolean(address);

  return (
    <section className="rounded-2xl border border-[#DDD6FE] bg-gradient-to-br from-[#F5F3FF] via-white to-[#ECFEFF] p-6 dark:border-white/12 dark:from-[#181625] dark:via-[#14121C] dark:to-[#181625]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.22em] text-[#7C3AED] uppercase">Cobro de comisiones</p>
          <h2 className="mt-2 text-lg font-bold tracking-tight text-[#1E1E24] dark:text-[#F2F0F7]">Mi wallet USDT (TRC20)</h2>
        </div>
        {saved ? (
          <span className="rounded-full bg-[#E8F7EE] px-3 py-1 text-xs font-medium text-[#067647]">Configurada</span>
        ) : (
          <span className="rounded-full bg-[#FFF4E0] px-3 py-1 text-xs font-medium text-[#B54708]">Sin configurar</span>
        )}
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5C5854] dark:text-[#9B96AC]">
        Aquí recibirás tus comisiones en cada corte, en la red <strong>Tron (TRC20)</strong>. Pega tu dirección: empieza
        con <strong>T</strong> y tiene 34 caracteres. Revísala muy bien; los envíos a una dirección equivocada no se
        pueden revertir.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="T..."
          autoComplete="off"
          spellCheck={false}
          className="w-full min-w-0 flex-1 rounded-lg border border-[#E7E2DA] bg-white px-3 py-2 font-mono text-sm text-[#1E1E24] outline-none focus:border-[#7C3AED] dark:border-white/12 dark:bg-[#181625] dark:text-[#F2F0F7]"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending || !dirty}
            onClick={save}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-medium text-white hover:bg-[#6D28D9] disabled:opacity-50 sm:flex-none"
          >
            <Wallet className="size-4" />
            {pending ? "Guardando…" : "Guardar"}
          </button>
          {saved ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setValue("");
                startTransition(async () => {
                  const result = await saveUsdtWallet("");
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success("Wallet USDT eliminada");
                });
              }}
              className="rounded-lg border border-[#E7E2DA] bg-white px-3 py-2 text-sm font-medium text-[#5C5854] disabled:opacity-50 dark:border-white/12 dark:bg-[#181625] dark:text-[#9B96AC]"
            >
              Quitar
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
