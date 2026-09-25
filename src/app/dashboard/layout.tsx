import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { CreditProvider } from "@/components/dashboard/credit-provider";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { brand } from "@/config/brand";
import { PendingMembership } from "@/components/dashboard/pending-membership";
import { getPackage, isSignupPlanId } from "@/config/compensation-plan";
import { getCurrentUser, getRecentTransactions } from "@/lib/auth/profile";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);

  const transactions = await getRecentTransactions(user.id);
  const pendingPlan = user.pendingPackage && isSignupPlanId(user.pendingPackage) ? getPackage(user.pendingPackage) : null;

  return (
    <CreditProvider
      initialBalance={user.credits}
      initialTransactions={transactions}
      totalEarnedCommissions={user.walletBalance}
    >
      <DashboardShell user={user}>
        {pendingPlan ? <PendingMembership label={pendingPlan.label} price={pendingPlan.price} /> : null}
        {children}
      </DashboardShell>
    </CreditProvider>
  );
}
