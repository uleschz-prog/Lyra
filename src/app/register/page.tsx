import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/auth/register-form";
import { brand } from "@/config/brand";
import { isSignupPlanId } from "@/config/compensation-plan";
import { getCurrentUser } from "@/lib/auth/profile";
import { readOauthProfile } from "@/lib/auth/oauth";
import { getPrisma } from "@/lib/prisma";
import { ensureProject } from "@/lib/projects";

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
    if (idea && process.env.DATABASE_URL) {
      await ensureProject(getPrisma(), user.id, idea, params.tipo).catch(() => null);
    }
    redirect(brand.links.dashboard);
  }

  const refCode = params.ref?.trim() || "LYRA-ROOT";
  const profile = await readOauthProfile().catch(() => null);

  return (
    <main
      className="grid min-h-screen place-items-center px-4 py-10"
      style={{
        backgroundColor: "#E6EDF8",
        backgroundImage: "radial-gradient(#c9d4e8 1.1px, transparent 1.1px)",
        backgroundSize: "14px 14px",
      }}
    >
      <section className="w-full max-w-[440px] bg-white px-8 py-12 shadow-[0_12px_40px_rgba(40,60,110,0.08)]">
        <RegisterForm
          refCode={profile?.ref || refCode}
          idea={profile?.idea || idea}
          kind={profile?.kind || params.tipo || ""}
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
