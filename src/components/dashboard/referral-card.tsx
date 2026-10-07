"use client";

import { Check, Copy, MessageCircle, Send, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { creditRechargeUsd, isFounderPackage } from "@/config/compensation-plan";
import { VegaMascot } from "@/components/vega/vega-mark";

const shareText = "Te invito a LYRA: agentes de IA que crean, venden y dan seguimiento por ti, más un plan para ganar refiriendo.";

export function ReferralCard({
  link,
  packageId,
  directs,
  joinedThisMonth,
}: {
  link: string;
  packageId: string;
  directs: number;
  joinedThisMonth: number;
}) {
  const [copied, setCopied] = useState(false);
  const recharge = creditRechargeUsd(packageId);
  const message = `${shareText}\n${link}`;

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("¡Enlace copiado al portapapeles!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar el enlace.");
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: "LYRA", text: shareText, url: link });
    } catch {
      // El usuario cerró el menú de compartir.
    }
  }

  const button =
    "inline-flex min-w-0 items-center justify-center gap-2 rounded-xl border border-[#E7E2DA] bg-white px-3 py-2.5 text-sm text-[#1E1E24] transition-colors hover:border-[#C4B5FD] sm:flex-none sm:px-3.5 sm:py-2";

  return (
    <section
      id="invitar"
      className="relative w-full min-w-0 scroll-mt-24 overflow-hidden rounded-2xl border border-[#DDD6FE] bg-gradient-to-br from-[#F5F3FF] via-white to-[#ECFEFF] p-4 sm:p-6"
    >
      <div className="pointer-events-none absolute -top-16 right-0 hidden h-48 w-48 rounded-full bg-[#7C3AED]/10 blur-3xl sm:block" aria-hidden />
      <div className="relative min-w-0">
        <p className="flex items-center gap-2 text-[10px] tracking-[0.16em] text-[#5C5854] uppercase">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#10B981]" />
          Enlace listo para compartir
        </p>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-[#1E1E24]">Invita a tu red</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="min-w-0 rounded-xl bg-white/80 px-3 py-2">
            <p className="text-xl font-semibold text-[#1E1E24] tabular-nums">{directs}</p>
            <p className="text-xs text-[#5C5854]">directos</p>
          </div>
          <div className="min-w-0 rounded-xl bg-white/80 px-3 py-2">
            <p className="text-xl font-semibold text-[#7C3AED] tabular-nums">+{joinedThisMonth}</p>
            <p className="text-xs text-[#5C5854]">este mes</p>
          </div>
        </div>
      </div>

      <div className="relative mt-3 flex min-w-0 flex-col gap-2 overflow-hidden rounded-xl border border-[#E7E2DA] bg-white p-2 sm:flex-row sm:items-center sm:py-1.5 sm:pr-1.5 sm:pl-4">
        <p className="w-full min-w-0 truncate text-sm text-[#7C3AED]">{link || "Preparando enlace…"}</p>
        <button
          type="button"
          onClick={() => void copyLink()}
          disabled={!link}
          className="inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#7C3AED] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#6D28D9] disabled:opacity-50 sm:w-auto sm:py-1.5"
        >
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>

      <div className="relative mt-3 grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className={button}>
          <MessageCircle className="h-4 w-4 shrink-0 text-[#16A34A]" aria-hidden />
          WhatsApp
        </a>
        <a
          href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={button}
        >
          <Send className="h-4 w-4 shrink-0 text-[#0284C7]" aria-hidden />
          Telegram
        </a>
        <button type="button" onClick={() => void nativeShare()} className={`${button} col-span-2 sm:hidden`}>
          <Share2 className="h-4 w-4 shrink-0 text-[#7C3AED]" aria-hidden />
          Más opciones
        </button>
      </div>

      <div className="relative mt-3 flex min-w-0 items-center gap-3 rounded-xl border border-[#DDD6FE] bg-white/70 p-3 sm:p-4">
        <VegaMascot className="h-16 w-16 shrink-0 sm:h-20 sm:w-20" />
        <p className="min-w-0 text-sm leading-6 text-[#5C5854]">
        {isFounderPackage(packageId)
          ? "Tu cuenta Pro cobra Órbita en los 6 niveles."
          : recharge
            ? `Tu recarga mínima es de $${recharge} al mes siguiente. Un crédito equivale a $1.`
            : "Inicio entra con $29, Negocio con $99 y Pro con $249. Un crédito equivale a $1."}
        </p>
      </div>
    </section>
  );
}
