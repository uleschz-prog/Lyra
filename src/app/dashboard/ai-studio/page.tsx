import type { Metadata } from "next";

import { AiStudio } from "@/components/ai-studio/ai-studio";
import { PageHeader } from "@/components/dashboard/page-header";
import { agents } from "@/lib/demo-data";

export const metadata: Metadata = {
  title: "Estudio IA",
};

export default async function AiStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const { agent } = await searchParams;

  return (
    <>
      <PageHeader
        eyebrow="Estudio IA"
        title="Agentes"
        description="Elige un agente, escribe el contexto y descuenta créditos. La respuesta de esta versión se simula en el navegador."
      />
      <AiStudio key={agent ?? "studio"} agents={agents} initialAgentId={agent} />
    </>
  );
}
