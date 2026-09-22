import type { ReactNode } from "react";

import { CreditProvider } from "@/components/dashboard/credit-provider";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { demoUser, demoWallet } from "@/lib/demo-data";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <CreditProvider
      initialBalance={demoWallet.balance}
      initialTransactions={demoWallet.transactions}
      totalEarnedCommissions={demoWallet.totalEarnedCommissions}
    >
      <DashboardShell user={demoUser}>{children}</DashboardShell>
    </CreditProvider>
  );
}
