"use client";

import { Check, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createActivationCode } from "@/app/dashboard/wallet/actions";
import { getPackage, type SignupPlanId } from "@/config/compensation-plan";
import { formatCredits, formatUsd } from "@/lib/format";

export type ActivationRow = {
  code: string;
  packageId: string;
  price: number;
  usedBy: string | null;
  createdAt: string;
};

const options: SignupPlanId[] = ["STARTED", "PRO", "FOUNDER"];

export function ActivationCodes({
  balance,
  codes,
  inviteBase,
}: {
  balance: number;
  codes: ActivationRow[];
  inviteBase: string;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState<SignupPlanId>("STARTED");
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const price = getPackage(choice).price;
  const used = codes.filter((row) => row.usedBy).length;
  const recovered = codes.filter((row) => row.usedBy).reduce((total, row) => total + row.price, 0);

  async function generate() {
    setPending(true);
    const result = await createActivationCode(choice);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Código ${result.code} listo`);
    router.refresh();
  }

  async function copy(code: string) {
    await navigator.clipboard.writeText(`${inviteBase}&codigo=${code}`);
    setCopied(code);
    toast.success("Enlace de activación copiado");
    window.setTimeout(() => setCopied(null), 1600);
  }

  return (
    <section className="rounded-2xl border border-[#1E1E24] bg-[#1E1E24] p-6 text-white">
      <p className="text-[11px] font-medium tracking-[0.22em] text-white/60 uppercase">Créditos de activación</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-3xl font-semibold tabular-nums">{formatCredits(balance)}</h2>
        <p className="text-sm text-white/70">
          {used} {used === 1 ? "cuenta activada" : "cuentas activadas"} · {formatUsd(recovered)} en membresías
        </p>
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70">
        Genera un código, compártelo y la persona entra con su membresía pagada. Tú decides cuánto le cobras y así
        recuperas tu capital. Estas cuentas no generan puntos ni comisiones.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setChoice(option)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              choice === option ? "border-white bg-white text-[#1E1E24]" : "border-white/25 text-white/80"
            }`}
          >
            {getPackage(option).label} · {formatUsd(getPackage(option).price)}
          </button>
        ))}
        <button
          type="button"
          onClick={generate}
          disabled={pending || balance < price}
          className="rounded-md bg-[#7C3AED] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Generando…" : `Generar código ${getPackage(choice).label}`}
        </button>
      </div>
      {codes.length > 0 ? (
        <ul className="mt-6 divide-y divide-white/10 rounded-xl border border-white/10">
          {codes.map((row) => (
            <li key={row.code} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="font-mono tracking-wide">{row.code}</span>
              <span className="text-white/70">
                {getPackage(row.packageId as SignupPlanId).label} · {formatUsd(row.price)}
              </span>
              {row.usedBy ? (
                <span className="text-emerald-300">Usado por {row.usedBy}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => void copy(row.code)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/25 px-2.5 py-1 text-xs"
                >
                  {copied === row.code ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                  Copiar enlace
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
