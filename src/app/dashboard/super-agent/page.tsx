import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listVegaChats } from "@/app/dashboard/super-agent/actions";
import { AgentNight } from "@/components/landing/agent-night";
import { VegaChat } from "@/components/vega/vega-chat";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { canUseVega } from "@/lib/vega/access";
import { isUserToolkit } from "@/lib/vega/apps";

export const metadata: Metadata = {
  title: "Super agente",
};

const powers = [
  { title: "Atiende", text: "Responde en WhatsApp a cualquier hora con el tono de tu marca." },
  { title: "Vende", text: "Presenta tu oferta, resuelve dudas y envía la liga de pago." },
  { title: "Cobra", text: "Confirma cada transferencia y te avisa en cuanto llega el dinero." },
  { title: "Coordina", text: "Dirige a tus agentes para que cada cliente reciba seguimiento." },
];

export default async function SuperAgentPage({ searchParams }: { searchParams: Promise<{ conexion?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);

  if (canUseVega(user)) {
    const [chats, { conexion }] = await Promise.all([listVegaChats(), searchParams]);
    return (
      <VegaChat
        firstName={user.name.split(" ")[0] || user.name}
        initialChats={chats}
        justConnected={conexion && isUserToolkit(conexion) ? conexion : null}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="text-center">
        <p className="text-[11px] font-medium tracking-[0.22em] text-[#7C3AED] uppercase">Exclusivo Pro y Corporate</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#1E1E24] sm:text-4xl">Vega, tu superagente</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#5C5854]">
          Un agente que vende y cobra por ti mientras duermes, al mando de todos tus agentes.
        </p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {powers.map((power) => (
          <li key={power.title} className="rounded-2xl border border-[#E7E2DA] bg-white p-5">
            <p className="text-sm font-medium text-[#1E1E24]">{power.title}</p>
            <p className="mt-2 text-sm leading-relaxed text-[#5C5854]">{power.text}</p>
          </li>
        ))}
      </ul>

      <section className="rounded-3xl border border-[#E7E2DA] bg-white px-4 py-8 sm:px-8">
        <AgentNight />
      </section>

      <div className="flex justify-center">
        <Link href="/dashboard/plan" className="inline-flex rounded-full bg-[#7C3AED] px-6 py-3 text-sm font-medium text-white">
          Activar con Pro o Corporate
        </Link>
      </div>
    </div>
  );
}
