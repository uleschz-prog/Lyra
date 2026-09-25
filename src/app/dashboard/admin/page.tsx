import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminUsers, type AdminUserRow } from "@/components/admin/admin-users";
import { PageHeader } from "@/components/dashboard/page-header";
import { CloseMonth } from "@/components/plan/close-month";
import { canonicalBalance } from "@/lib/credits/ledger-logic";
import { getCurrentUser } from "@/lib/auth/profile";
import { isSuspended } from "@/lib/auth/suspension";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Panel admin",
};

export default async function AdminPage() {
  const admin = await getCurrentUser();
  if (admin?.role !== "ADMIN") redirect("/dashboard");

  const users = await getPrisma().user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      role: true,
      package: true,
      pendingPackage: true,
      credits: true,
      wallet: { select: { balance: true } },
      activationCredits: true,
      walletBalance: true,
      createdAt: true,
      suspendedUntil: true,
      sponsor: { select: { name: true } },
      _count: { select: { referrals: true } },
    },
  });

  const rows: AdminUserRow[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    isAdmin: user.role === "ADMIN",
    packageId: user.package === "NONE" ? null : user.package,
    pendingPackage: user.pendingPackage,
    credits: canonicalBalance(user.credits, user.wallet?.balance ?? null),
    activationCredits: user.activationCredits,
    walletBalance: user.walletBalance,
    sponsorName: user.sponsor?.name ?? null,
    referrals: user._count.referrals,
    createdAt: user.createdAt.toISOString(),
    suspendedUntil: isSuspended(user.suspendedUntil) ? user.suspendedUntil!.toISOString() : null,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Administración"
        title="Panel admin"
        description="Cierra el mes, valida inscripciones, ajusta créditos, edita datos de acceso, suspende o borra cuentas y descarga el respaldo de socios."
      />
      <CloseMonth />
      <div className="mt-8">
        <AdminUsers users={rows} />
      </div>
    </>
  );
}
