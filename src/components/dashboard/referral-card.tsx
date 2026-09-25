"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { creditRechargeUsd, isFounderPackage } from "@/config/compensation-plan";

export function ReferralCard({
  link,
  packageId,
}: {
  link: string;
  packageId: string;
}) {
  const recharge = creditRechargeUsd(packageId);

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("¡Enlace copiado al portapapeles!");
    } catch {
      toast.error("No se pudo copiar el enlace.");
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface/80 p-6 backdrop-blur-md">
      <p className="flex items-center gap-2 text-[10px] tracking-[0.16em] text-[#5C5854] uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
        Enlace listo para compartir
      </p>
      <p className="mt-3 text-lg font-semibold tracking-tight text-[#1E1E24]">Invita a tu red</p>
      <p className="relative mt-2 break-all text-sm text-[#7C3AED]">{link || "Preparando enlace…"}</p>
      <div className="relative mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" variant="constellation" onClick={() => void copyLink()} disabled={!link}>
          Copiar Enlace de Invitación
        </Button>
      </div>
      <p className="relative mt-4 text-sm leading-6 text-[#5C5854]">
        {isFounderPackage(packageId)
          ? "Tu cuenta Founder cobra el máximo de la red desde el día 0 y recibe 40 créditos con cada mensualidad."
          : recharge
            ? `Tu recarga mínima es de $${recharge} al mes siguiente. Un crédito equivale a $1.`
            : "Started entra con $99, Pro con $499, Founder con $1,000 y Corporate con $5,000. Un crédito equivale a $1."}
      </p>
    </section>
  );
}
