import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminUsers, type AdminUserRow } from "@/components/admin/admin-users";
import { CompanyUsdtWallet } from "@/components/admin/company-usdt-wallet";
import { SettleCommissions } from "@/components/admin/settle-commissions";
import { UsdtOrders } from "@/components/admin/usdt-orders";
import { PageHeader } from "@/components/dashboard/page-header";
import { CloseMonth } from "@/components/plan/close-month";
import { getCurrentUser } from "@/lib/auth/profile";
import { isSuspended } from "@/lib/auth/suspension";
import { getCompanyUsdtWallet } from "@/lib/payments/usdt";
import { trongridReady } from "@/lib/payments/usdt-verify";
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
      activationCredits: true,
      walletBalance: true,
      usdtTrc20: true,
      createdAt: true,
      suspendedUntil: true,
      sponsor: { select: { name: true } },
      _count: { select: { referrals: true } },
    },
  });

  const companyUsdt = await getCompanyUsdtWallet();

  const pendingOrders = await getPrisma().usdtOrder.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      purpose: true,
      amountUsd: true,
      trxHash: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  });
  const usdtOrderRows = pendingOrders.map((order) => ({
    id: order.id,
    purpose: order.purpose,
    amountUsd: Number(order.amountUsd) || 0,
    trxHash: order.trxHash,
    createdAt: order.createdAt.toISOString(),
    userName: order.user.name,
  }));

  const rows: AdminUserRow[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    isAdmin: user.role === "ADMIN",
    packageId: user.package === "NONE" ? null : user.package,
    pendingPackage: user.pendingPackage,
    credits: user.credits,
    activationCredits: user.activationCredits,
    walletBalance: user.walletBalance,
    usdtTrc20: user.usdtTrc20,
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
        description="Cierra el mes, valida inscripciones, ajusta créditos, cambia paquetes, administra wallets USDT, corta comisiones, edita datos de acceso, suspende o borra cuentas y descarga el respaldo de socios."
      />
      <CloseMonth />
      <div className="mt-5">
        <CompanyUsdtWallet address={companyUsdt} />
      </div>
      <div className="mt-5">
        <UsdtOrders initialOrders={usdtOrderRows} verifyEnabled={trongridReady()} />
      </div>
      <div className="mt-5">
        <SettleCommissions />
      </div>
      <div className="mt-8">
        <AdminUsers users={rows} />
      </div>
    </>
  );
}
