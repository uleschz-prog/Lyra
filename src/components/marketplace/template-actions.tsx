"use client";

import { Check, LoaderCircle, ShoppingCart, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { applyTemplateAction, buyTemplateAction } from "@/app/dashboard/marketplace/actions";

/** «Usar plantilla» (y comprar antes si cuesta créditos). Al terminar, lleva al proyecto o a Vega. */
export function TemplateActions({
  templateId,
  kind,
  price,
  owned,
}: {
  templateId: string;
  kind: string;
  price: number;
  owned: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [hasIt, setHasIt] = useState(owned);
  const [done, setDone] = useState<{ projectId: string; agentId: string | null } | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      if (!hasIt) {
        const bought = await buyTemplateAction(templateId);
        if (!bought.ok) {
          toast.error(bought.error);
          return;
        }
        setHasIt(true);
        toast.success(bought.already ? "Ya la tenías comprada." : `Compraste la plantilla por ${price} créditos.`);
      }
      const used = await applyTemplateAction(templateId, crypto.randomUUID());
      if (!used.ok) {
        toast.error(used.error);
        return;
      }
      setDone({ projectId: used.projectId, agentId: used.agentId });
      toast.success(kind === "agente" ? "Listo: creamos el agente en Vega y su proyecto." : "Listo: la plantilla ya está en tus Proyectos.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-[#047857]">
          <Check className="size-4" /> Plantilla copiada a tu cuenta
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/proyectos/${done.projectId}`} className="inline-flex rounded-full bg-[#7C3AED] px-4 py-2 text-sm font-medium text-white">
            Abrir proyecto
          </Link>
          <Link href="/dashboard/super-agent" className="inline-flex rounded-full border border-[#E7E2DA] px-4 py-2 text-sm font-medium text-[#1E1E24] dark:border-white/12 dark:text-[#F2F0F7]">
            Editar con Vega
          </Link>
        </div>
      </div>
    );
  }

  const paid = price > 0 && !hasIt;
  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={busy}
      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#7C3AED] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#6D28D9] disabled:opacity-60"
    >
      {busy ? <LoaderCircle className="size-4 animate-spin" /> : paid ? <ShoppingCart className="size-4" /> : <Sparkles className="size-4" />}
      {paid ? `Comprar y usar · ${price} créditos` : "Usar plantilla"}
    </button>
  );
}
