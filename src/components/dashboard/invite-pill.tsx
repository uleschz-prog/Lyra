"use client";

import { Check, Copy, MessageCircle, Send, Share2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const shareText = "Te invito a LYRA: agentes de IA que crean, venden y dan seguimiento por ti, más un plan para ganar refiriendo.";

export function InvitePill({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const message = `${shareText}\n${link}`;

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          id="invitar"
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-[#E7E2DA]/90 bg-white/70 px-3 py-1.5 text-sm font-medium text-[#5C5854] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8)] backdrop-blur-sm transition hover:border-[#C4B5FD] hover:text-[#1E1E24] dark:border-white/12 dark:bg-white/5 dark:text-[#C7C2D3] dark:hover:border-[#7C3AED]/50 dark:hover:text-white"
        >
          <UserPlus className="size-3.5 text-[#7C3AED]" aria-hidden />
          Invitar
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="dark:border-white/10 dark:bg-[#1B1924] dark:text-white">
        <DropdownMenuItem onSelect={() => void copyLink()} className="gap-2 dark:focus:bg-white/8">
          {copied ? <Check className="size-4 text-[#10B981]" aria-hidden /> : <Copy className="size-4 text-[#7C3AED]" aria-hidden />}
          {copied ? "Copiado" : "Copiar enlace"}
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="dark:focus:bg-white/8">
          <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className="gap-2">
            <MessageCircle className="size-4 text-[#16A34A]" aria-hidden />
            WhatsApp
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="dark:focus:bg-white/8">
          <a
            href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="gap-2"
          >
            <Send className="size-4 text-[#0284C7]" aria-hidden />
            Telegram
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void nativeShare()} className="gap-2 sm:hidden dark:focus:bg-white/8">
          <Share2 className="size-4 text-[#7C3AED]" aria-hidden />
          Más opciones
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
