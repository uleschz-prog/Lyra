import type { Metadata } from "next";
import Link from "next/link";

import { AiStudio } from "@/components/ai-studio/ai-studio";
import { agents } from "@/lib/demo-data";
import { getCurrentUser } from "@/lib/auth/profile";

export const metadata: Metadata = {
  title: "Estudio IA",
};

export default async function AiStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const { agent } = await searchParams;
  const user = await getCurrentUser();

  if (user?.package === "STARTED") {
    return (
      <section className="mx-auto max-w-xl rounded-2xl border border-border bg-white p-8">
        <p className="text-[11px] font-medium tracking-[0.22em] text-[#7C3AED] uppercase">Pro</p>
        <h1 className="mt-2 text-2xl text-[#1E1E24]">Los agentes autónomos están en Pro</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#5C5854]">
          Started incluye notebook, academia y creación de video e imágenes. Los agentes autónomos se activan con Pro.
          Founder suma Lyra superagente.
        </p>
        <Link href="/dashboard/plan" className="mt-6 inline-flex rounded-md bg-[#312F2F] px-4 py-2.5 text-sm font-medium text-white">
          Ver membresías
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {user?.package === "FOUNDER" ? (
        <p className="rounded-2xl border border-[#7C3AED]/30 bg-[#F5F3FF] px-5 py-4 text-sm text-[#1E1E24]">
          Lyra superagente está activo con tu membresía Founder.
        </p>
      ) : null}
      <AiStudio key={agent ?? "studio"} agents={agents} initialAgentId={agent} />
    </div>
  );
}
