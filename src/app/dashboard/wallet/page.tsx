import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { ActivationCodes } from "@/components/wallet/activation-codes";
import { CreditRecharge } from "@/components/wallet/credit-recharge";
import { UsdtWallet } from "@/components/wallet/usdt-wallet";
import { WalletPanel } from "@/components/wallet/wallet-panel";
import { brand } from "@/config/brand";
import {
  canSpendSignupCreditsOnCodes,
  creditRechargeUsdForCredits,
  founderCodeBudget,
  isFounderPackage,
  minimumCreditRecharge,
  rebuyStatus,
} from "@/config/compensation-plan";
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
  const initialQuote = mercadoPagoReady()
    ? await mercadoPagoQuote(creditRechargeUsdForCredits(minimumCreditRecharge))
    : null;
  const canMint = canSpendSignupCreditsOnCodes({
    packageId: user.package,
    activatedWithCode: user.activatedWithCode,
  });
  const activation = canMint || user.package === "CORPORATE" || user.activationCredits > 0;
  const codes = activation
    ? await getPrisma().activationCode.findMany({
        where: { ownerId: user.id },
        orderBy: { createdAt: "desc" },
        take: 60,
        select: { code: true, packageId: true, price: true, createdAt: true, usedBy: { select: { name: true } } },
      })
    : [];
  const spentOnCodes = codes.reduce((total, row) => total + row.price, 0);
  const activationBalance = canMint
    ? founderCodeBudget({ spentUsd: spentOnCodes, credits: user.credits, activationCredits: user.activationCredits })
    : user.activationCredits;
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const inviteBase = `${proto}://${host}${brand.links.register}?ref=${user.username}&entrada=1`;

  const paidOk = params.pago === "ok";
  const notice = paidOk
    ? params.tipo === "signup"
      ? "Pago recibido. Tu membresía quedó activa. Bienvenido a LYRA."
      : params.tipo === "rebuy"
        ? "Pago recibido. Tu recarga mensual quedó activa."
        : "Pago recibido. Tus créditos ya están en tu cuenta."
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
            ? "Tus comisiones quedan en dólares. Recarga desde 5 créditos al mes para mantener la actividad y participar en los bonos."
            : "Tus comisiones quedan en dólares. Elige la cantidad de créditos que necesitas; una recarga mensual desde 5 mantiene tu actividad."
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
            balance={activationBalance}
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
          activeThisMonth={user.rebuyPaidThisMonth || status.exempt}
          mercadoPagoEnabled={mercadoPagoReady()}
          initialQuote={initialQuote}
        />
        <UsdtWallet address={user.usdtTrc20} />
        <WalletPanel />
      </div>
    </>
  );
}
