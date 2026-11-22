import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listVegaAgents, listVegaChats } from "@/app/dashboard/super-agent/actions";
import { AgentNight } from "@/components/landing/agent-night";
import { VegaChat } from "@/components/vega/vega-chat";
import { getPrisma } from "@/lib/prisma";
import { brand } from "@/config/brand";
import { getPackage, isPackageId } from "@/config/compensation-plan";
import { getCurrentUser } from "@/lib/auth/profile";
import { canUseVega } from "@/lib/vega/access";
import { isVegaAgentId, sanitizeVegaDraft } from "@/lib/dashboard/home-logic";
import { isUserToolkit } from "@/lib/vega/apps";

export const metadata: Metadata = {
  title: "Super agente",
};

const powers = [
  { title: "Atiende", text: "Responde en WhatsApp a cualquier hora con el tono de tu marca." },
  { title: "Vende", text: "Presenta tu oferta, resuelve dudas y envía la liga de pago." },
  { title: "Crea", text: "Arma sitios, apps, agentes y juegos desde el chat." },
  { title: "Coordina", text: "Dirige a tus agentes para que cada cliente reciba seguimiento." },
];

export default async function SuperAgentPage({ searchParams }: { searchParams: Promise<{ conexion?: string; editar?: string; mensaje?: string; agente?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);

  if (canUseVega(user)) {
    const [agents, { conexion, editar, mensaje, agente }] = await Promise.all([listVegaAgents(), searchParams]);
    // Entrega 4: «Editar con Vega» desde Proyectos deja el mensaje empezado con el proyecto.
    const editing =
      editar && /^[a-z0-9]{10,40}$/i.test(editar)
        ? await getPrisma()
            .project.findFirst({ where: { id: editar, userId: user.id, deletedAt: null, kind: { in: ["sitio", "app"] } }, select: { id: true, title: true } })
            .catch(() => null)
        : null;
    const selectedAgent = (isVegaAgentId(agente) && agents.find((agent) => agent.id === agente)) || agents[0];
    const chats = selectedAgent ? await listVegaChats(selectedAgent.id) : [];
    const draft = editing ? `Quiero cambiar mi proyecto «${editing.title}» (id ${editing.id}): ` : sanitizeVegaDraft(mensaje);
    return (
      <VegaChat
        firstName={user.name.split(" ")[0] || user.name}
        initialAgents={agents}
        initialAgentId={selectedAgent?.id ?? ""}
        initialChats={chats}
        justConnected={conexion && isUserToolkit(conexion) ? conexion : null}
        creditAllowance={isPackageId(user.package) ? Math.max(getPackage(user.package).credits, 1) : Math.max(user.credits, 1)}
        initialDraft={draft}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="text-center">
        <p className="text-[11px] font-medium tracking-[0.22em] text-[#7C3AED] uppercase">Incluido en tu membresía</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#1E1E24] sm:text-4xl">Vega, tu superagente</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#5C5854]">
          Un agente que atiende, vende y da seguimiento por ti, al mando de todos tus agentes.
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
        <Link href="/dashboard/upgrade" className="inline-flex rounded-full bg-[#7C3AED] px-6 py-3 text-sm font-medium text-white">
          Activar una membresía
        </Link>
      </div>
    </div>
  );
}
