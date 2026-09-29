import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { ActivationCodes } from "@/components/wallet/activation-codes";
import { CreditRecharge } from "@/components/wallet/credit-recharge";
import { WalletPanel } from "@/components/wallet/wallet-panel";
import { brand } from "@/config/brand";
import { creditRechargeUsd, isFounderPackage, rebuyStatus } from "@/config/compensation-plan";
import { getCurrentUser } from "@/lib/auth/profile";
import { mercadoPagoQuote, mercadoPagoReady } from "@/lib/payments/mercadopago";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Billetera",
};

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ pago?: string; tipo?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);

  const status = rebuyStatus(user.package, user.activeDirects);
  const extraUsd = creditRechargeUsd(user.package);
  const quotes = mercadoPagoReady()
    ? {
        rebuy: status.amount > 0 ? await mercadoPagoQuote(status.amount) : null,
        credits: extraUsd ? await mercadoPagoQuote(extraUsd) : null,
      }
    : null;
  const activation = user.package === "CORPORATE" || user.activationCredits > 0;
  const codes = activation
    ? await getPrisma().activationCode.findMany({
        where: { ownerId: user.id },
        orderBy: { createdAt: "desc" },
        take: 60,
        select: { code: true, packageId: true, price: true, createdAt: true, usedBy: { select: { name: true } } },
      })
    : [];
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const inviteBase = `${proto}://${host}${brand.links.register}?ref=${user.username}&entrada=1`;

  const paidOk = params.pago === "ok";
  const notice = paidOk
    ? params.tipo === "signup"
      ? "Pago recibido. Tu membresía quedó activa. Bienvenido a LYRA."
      : params.tipo === "rebuy"
        ? "Pago recibido. Tu recompra del mes quedó activa."
        : "Pago recibido. Tus créditos extra ya están en tu cuenta."
    : params.pago === "pendiente"
      ? "Tu pago está en proceso. Se activa en cuanto Mercado Pago lo acredite."
      : params.pago === "error"
        ? "Mercado Pago no aprobó el pago. Puedes intentarlo de nuevo."
        : params.pago === "cancelado"
          ? "El pago no se completó. Puedes intentarlo de nuevo."
          : null;

  return (
    <>
      <PageHeader
        eyebrow="Billetera"
        title="Saldos"
        description={
          isFounderPackage(user.package)
            ? "Tus comisiones quedan en dólares. La mensualidad de Founder es de $29 e incluye 40 créditos; con 3 directos activos quedas exento."
            : "Las comisiones quedan en dólares. Paga tu recompra para seguir activo: con 3 directos activos quedas exento."
        }
      />
      <div className="space-y-6">
        {notice ? (
          <p
            className={`rounded-2xl px-5 py-4 text-sm font-medium ${
              paidOk ? "bg-[#ECFDF5] text-[#065F46]" : "bg-[#F7F5F1] text-[#1E1E24]"
            }`}
          >
            {notice}
          </p>
        ) : null}
        {activation ? (
          <ActivationCodes
            balance={user.activationCredits}
            inviteBase={inviteBase}
            codes={codes.map((row) => ({
              code: row.code,
              packageId: row.packageId,
              price: row.price,
              usedBy: row.usedBy?.name ?? null,
              createdAt: row.createdAt.toISOString(),
            }))}
          />
        ) : null}
        <CreditRecharge
          packageId={user.package}
          amount={status.amount}
          exempt={status.exempt}
          exemptLabel={status.label}
          paid={user.rebuyPaidThisMonth}
          remaining={status.remaining}
          quotes={quotes}
        />
        <WalletPanel />
      </div>
    </>
  );
}
