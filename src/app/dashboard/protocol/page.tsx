import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { AutonomousProtocol } from "@/components/protocol/autonomous-protocol";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";

export const metadata: Metadata = {
  title: "Lyra Autonomous Protocol",
};

export default async function ProtocolPage() {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);

  return (
    <>
      <PageHeader
        eyebrow="Protocolo"
        title="Lyra Autonomous Protocol"
        description="Conecta tu MetaMask, mira el agente en Polygon Amoy y el historial de trades en vivo."
        section="protocol"
      />
      <AutonomousProtocol />
    </>
  );
}
