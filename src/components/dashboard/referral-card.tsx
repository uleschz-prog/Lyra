"use client";

import { Check, Copy, MessageCircle, Send, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { VegaMascot } from "@/components/vega/vega-mark";
import { activeDirectBonusCredits, compensationPlan, minimumCreditRecharge } from "@/config/compensation-plan";
import { formatCredits } from "@/lib/format";
import { cn } from "@/lib/utils";

const shareText = "Te invito a LYRA: agentes de IA que crean, venden y dan seguimiento por ti, más un plan para ganar refiriendo.";

export function ReferralCard({
  link,
  directs,
  joinedThisMonth,
  activeDirects,
}: {
  link: string;
  directs: number;
  joinedThisMonth: number;
  activeDirects?: number;
}) {
  const [copied, setCopied] = useState(false);
  const message = `${shareText}\n${link}`;
  const needed = compensationPlan.minActiveDirectsForBonus;
  const knownActive = typeof activeDirects === "number";
  const progress = knownActive ? Math.min(100, Math.round((activeDirects / Math.max(needed, 1)) * 100)) : null;
  const remaining = knownActive ? Math.max(needed - activeDirects, 0) : null;

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Enlace copiado.");
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
    "inline-flex min-w-0 items-center justify-center gap-2 rounded-xl border border-[#E7E2DA] bg-white/80 px-3 py-2.5 text-sm font-medium text-[#1E1E24] transition hover:border-[#C4B5FD] dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:border-[#7C3AED]/50 sm:flex-none sm:px-3.5 sm:py-2";

  return (
    <section
      id="invitar"
      className="relative w-full min-w-0 scroll-mt-24 overflow-hidden rounded-[24px] border border-[#DDD6FE]/90 bg-gradient-to-br from-[#F5F3FF] via-white to-[#ECFEFF] p-5 shadow-[0_18px_44px_-28px_rgba(76,29,149,0.45)] sm:p-6 dark:border-[#7C3AED]/25 dark:from-[#221A38] dark:via-[#1B1924] dark:to-[#152026]"
    >
      <div className="pointer-events-none absolute -top-20 right-0 h-56 w-56 rounded-full bg-[#7C3AED]/15 blur-3xl dark:bg-[#7C3AED]/25" aria-hidden />
      <div className="relative min-w-0">
        <p className="flex items-center gap-2 text-[11px] font-medium tracking-[0.16em] text-[#5C5854] uppercase dark:text-[#A9A3B8]">
          <span className="size-1.5 shrink-0 rounded-full bg-[#10B981]" />
          Enlace listo para compartir
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#1E1E24] dark:text-white">Invita a tu red</h2>
        <p className="mt-1 text-sm text-[#5C5854] dark:text-[#A9A3B8]">Comparte tu enlace. Cada socio que se une aparece aquí y en Partners.</p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="min-w-0 rounded-2xl bg-white/80 px-3.5 py-3 ring-1 ring-black/[0.03] dark:bg-white/5 dark:ring-white/8">
            <p className="text-[1.6rem] font-semibold tracking-tight text-[#1E1E24] tabular-nums dark:text-white">{formatCredits(directs)}</p>
            <p className="text-xs text-[#5C5854] dark:text-[#A9A3B8]">directos</p>
          </div>
          <div className="min-w-0 rounded-2xl bg-white/80 px-3.5 py-3 ring-1 ring-black/[0.03] dark:bg-white/5 dark:ring-white/8">
            <p className="text-[1.6rem] font-semibold tracking-tight text-[#7C3AED] tabular-nums dark:text-[#C4B5FD]">+{formatCredits(joinedThisMonth)}</p>
            <p className="text-xs text-[#5C5854] dark:text-[#A9A3B8]">este mes</p>
          </div>
        </div>

        {knownActive ? (
          <div className="mt-3 rounded-2xl bg-white/70 px-3.5 py-3 ring-1 ring-black/[0.03] dark:bg-white/5 dark:ring-white/8">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-[#1E1E24] dark:text-white">Directos activos</p>
              <p className="text-xs tabular-nums text-[#5C5854] dark:text-[#A9A3B8]">
                {formatCredits(activeDirects)} de {needed}
              </p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#EDE9FE] dark:bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A78BFA] transition-[width] duration-500" style={{ width: `${Math.max(progress === 0 ? 0 : 8, progress ?? 0)}%` }} />
            </div>
            <p className="mt-2 text-xs leading-5 text-[#5C5854] dark:text-[#A9A3B8]">
              {remaining === 0
                ? `Cumples el mínimo de ${needed} para el bono de hasta ${formatCredits(activeDirectBonusCredits)} créditos por directo activo.`
                : `Te falta${remaining === 1 ? "" : "n"} ${remaining} directo${remaining === 1 ? "" : "s"} activo${remaining === 1 ? "" : "s"} para el bono de créditos (${needed} en total).`}
            </p>
          </div>
        ) : null}
      </div>

      <div className="relative mt-4 flex min-w-0 flex-col gap-2 overflow-hidden rounded-2xl border border-[#E7E2DA] bg-white/90 p-2 sm:flex-row sm:items-center sm:py-1.5 sm:pr-1.5 sm:pl-4 dark:border-white/10 dark:bg-[#16141F]/80">
        <p className="w-full min-w-0 truncate text-sm text-[#7C3AED] dark:text-[#C4B5FD]">{link || "Preparando enlace…"}</p>
        <button
          type="button"
          onClick={() => void copyLink()}
          disabled={!link}
          className="inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#7C3AED] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#6D28D9] disabled:opacity-50 sm:w-auto sm:py-1.5"
        >
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>

      <div className="relative mt-3 grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className={button}>
          <MessageCircle className="size-4 shrink-0 text-[#16A34A]" aria-hidden />
          WhatsApp
        </a>
        <a
          href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={button}
        >
          <Send className="size-4 shrink-0 text-[#0284C7]" aria-hidden />
          Telegram
        </a>
        <button type="button" onClick={() => void nativeShare()} className={cn(button, "col-span-2 sm:hidden")}>
          <Share2 className="size-4 shrink-0 text-[#7C3AED]" aria-hidden />
          Más opciones
        </button>
      </div>

      <div className="relative mt-3 flex min-w-0 items-center gap-3 rounded-2xl border border-[#DDD6FE]/80 bg-white/60 p-3 sm:p-4 dark:border-white/10 dark:bg-white/5">
        <VegaMascot className="h-14 w-14 shrink-0 sm:h-16 sm:w-16" />
        <p className="min-w-0 text-sm leading-6 text-[#5C5854] dark:text-[#A9A3B8]">
          {`Recarga desde ${minimumCreditRecharge} créditos al mes para mantener la actividad. Compra 50 y recibe 60. Un crédito cuesta 1 USD.`}
        </p>
      </div>
    </section>
  );
}
