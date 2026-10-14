import type { Metadata } from "next";
import Link from "next/link";

import { AgentNight } from "@/components/landing/agent-night";
import { getCurrentUser } from "@/lib/auth/profile";
import { canUseVega } from "@/lib/vega/access";

export const metadata: Metadata = {
  title: "Super agente",
};

const powers = [
  { title: "Atiende", text: "Responde en WhatsApp a cualquier hora con el tono de tu marca." },
  { title: "Vende", text: "Presenta tu oferta, resuelve dudas y envía la liga de pago." },
  { title: "Cobra", text: "Confirma cada transferencia y te avisa en cuanto llega el dinero." },
  { title: "Coordina", text: "Dirige a tus agentes para que cada cliente reciba seguimiento." },
];

const market = [
  { title: "Sentimiento", text: "Clasifica cada post en local y solo llama al modelo si el tono negativo cruza el umbral." },
  { title: "Competidores", text: "Resume la semana de las cuentas que vigilas y la compara en un informe." },
  { title: "Tendencias", text: "Detecta hashtags cuyas menciones se aceleran entre dos ventanas." },
  { title: "Reportes", text: "El diario y el semanal llegan a tu correo. Cualquier otro envío te pide confirmación." },
];

export default async function SuperAgentPage() {
  const user = await getCurrentUser();
  const active = canUseVega(user?.package);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="text-center">
        <p className="text-[11px] font-medium tracking-[0.22em] text-[#7C3AED] uppercase">
          {active ? "Activo en tu plan" : "Exclusivo Founder y Corporate"}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#1E1E24] sm:text-4xl">Lyra superagente</h1>
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

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-[#1E1E24]">Inteligencia de mercado</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {market.map((item) => (
            <li key={item.title} className="rounded-2xl border border-[#E7E2DA] bg-white p-5">
              <p className="text-sm font-medium text-[#1E1E24]">{item.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-[#5C5854]">{item.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl border border-[#E7E2DA] bg-white px-4 py-8 sm:px-8">
        <AgentNight />
      </section>

      <div className="flex justify-center">
        {active ? (
          <Link href="/dashboard/ai-studio" className="inline-flex rounded-full bg-[#1E1E24] px-6 py-3 text-sm font-medium text-white">
            Configurar mis agentes
          </Link>
        ) : (
          <Link href="/dashboard/plan" className="inline-flex rounded-full bg-[#7C3AED] px-6 py-3 text-sm font-medium text-white">
            Ver planes
          </Link>
        )}
      </div>
    </div>
  );
}
