import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/auth/register-form";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { brand } from "@/config/brand";
import { isSignupPlanId } from "@/config/compensation-plan";
import { getCurrentUser } from "@/lib/auth/profile";
import { readOauthProfile } from "@/lib/auth/oauth";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Crea tu cuenta",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    ref?: string;
    idea?: string;
    tipo?: string;
    aviso?: string;
    paso?: string;
    entrada?: string;
    codigo?: string;
  }>;
}) {
  const params = await searchParams;
  const code = params.codigo?.trim().toUpperCase().slice(0, 24) ?? "";
  const activation =
    code && process.env.DATABASE_URL
      ? await getPrisma()
          .activationCode.findUnique({ where: { code }, select: { code: true, packageId: true, usedById: true } })
          .catch(() => null)
      : null;
  const idea = params.idea?.trim().slice(0, 240) ?? "";
  if (params.ref && !params.entrada && !idea && params.paso !== "plan") {
    redirect(`/r/${encodeURIComponent(params.ref)}`);
  }
  const user = await getCurrentUser();
  if (user) {
    redirect(brand.links.dashboard);
  }

  const refCode = params.ref?.trim() || "LYRA-ROOT";
  const profile = await readOauthProfile().catch(() => null);

  return (
    <main className="lyra-office relative grid min-h-screen place-items-center px-4 py-10">
      <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>
      <section className="w-full max-w-[440px] rounded-2xl border border-border bg-surface px-6 py-8 shadow-[0_12px_40px_rgba(40,60,110,0.08)] sm:px-8 sm:py-12">
        <RegisterForm
          refCode={profile?.ref || refCode}
          aviso={params.aviso ?? ""}
          activation={
            activation && !activation.usedById && isSignupPlanId(activation.packageId)
              ? { code: activation.code, packageId: activation.packageId }
              : null
          }
          activationError={code && (!activation || activation.usedById) ? "Ese código de activación no es válido o ya se usó." : ""}
          social={params.paso === "plan" && profile ? { email: profile.email, name: profile.name } : null}
        />
      </section>
    </main>
  );
}
