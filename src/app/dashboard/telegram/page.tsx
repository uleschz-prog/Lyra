import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { telegramOverview } from "@/app/dashboard/telegram/actions";
import { TelegramWorkspace } from "@/components/telegram/telegram-workspace";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";

export const metadata: Metadata = {
  title: "Telegram",
};

export default async function TelegramPage() {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);
  const overview = await telegramOverview();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-[11px] font-medium tracking-[0.22em] text-[#7C3AED] uppercase">Canal de ventas</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#1E1E24] sm:text-3xl">Tu bot de Telegram</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5C5854]">
          Tu propio bot atiende prospectos a cualquier hora, etiqueta cada campaña, da seguimiento y te pasa la conversación cuando alguien quiere comprar.
        </p>
      </header>
      <TelegramWorkspace initial={overview} />
    </div>
  );
}
