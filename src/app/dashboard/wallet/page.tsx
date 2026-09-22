import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { WalletPanel } from "@/components/wallet/wallet-panel";

export const metadata: Metadata = {
  title: "Billetera",
};

export default function WalletPage() {
  return (
    <>
      <PageHeader
        eyebrow="Billetera"
        title="Saldos"
        description="Las comisiones quedan en dólares. Los créditos bajan cuando consultas un agente en el estudio."
      />
      <WalletPanel />
    </>
  );
}
