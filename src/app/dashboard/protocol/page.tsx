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
        description="El agente intercambia en Polygon Amoy. Puedes pausarlo o activarlo cuando quieras."
        section="protocol"
      />
      <AutonomousProtocol canControl={user.role === "ADMIN"} />
    </>
  );
}
