import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { CreditProvider } from "@/components/dashboard/credit-provider";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { brand } from "@/config/brand";
import { getPackage, isSignupPlanId } from "@/config/compensation-plan";
import { PendingMembership } from "@/components/dashboard/pending-membership";
import { onboardingPath } from "@/lib/auth/onboarding";
import { getCurrentUser, getRecentTransactions } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);
  const onboarding = onboardingPath(user);
  if (onboarding) redirect(onboarding);

  const [transactions, unreadNotifications] = await Promise.all([
    getRecentTransactions(user.id),
    getPrisma().academyNotification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  const pendingPlan = user.pendingPackage && isSignupPlanId(user.pendingPackage) ? getPackage(user.pendingPackage) : null;

  return (
    <CreditProvider
      initialBalance={user.credits}
      initialTransactions={transactions}
      totalEarnedCommissions={user.walletBalance}
    >
      <DashboardShell user={user} unreadNotifications={unreadNotifications}>
        {pendingPlan ? <PendingMembership label={pendingPlan.label} price={pendingPlan.price} /> : null}
        {children}
      </DashboardShell>
    </CreditProvider>
  );
}
