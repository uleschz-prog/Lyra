import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { AgentNight } from "@/components/landing/agent-night";
import { brand } from "@/config/brand";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Entra a LYRA",
  description: "Creas aplicaciones, sitios y agentes. Generas rentas digitales cada vez que alguien usa la inteligencia artificial.",
};

async function inviterName(code: string) {
  if (!process.env.DATABASE_URL) return null;
  try {
    const person = await getPrisma().user.findFirst({
      where: {
        OR: [{ username: code.toLowerCase() }, { referralCode: code.toUpperCase() }],
      },
      select: { name: true },
    });
    return person?.name.split(" ")[0] ?? null;
  } catch {
    return null;
  }
}

export default async function ReferralLandingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const ref = decodeURIComponent(code).trim().slice(0, 40);
  const name = ref ? await inviterName(ref) : null;
  const join = `/register?ref=${encodeURIComponent(ref || "LYRA-ROOT")}&entrada=1`;

  return (
    <main className="flex min-h-screen flex-col bg-[#F7F5F2] text-[#1E1E24]">
      <header className="px-6 py-6 sm:px-10">
        <Logo ink />
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 pb-20 sm:px-10">
        <p className="text-sm text-[#8A8680]">{name ? `${name} te invitó a LYRA` : "Te invitaron a LYRA"}</p>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
          Aquí una idea se vuelve ingreso.
        </h1>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-[#5C5854]">
          Creas aplicaciones, sitios y agentes con una frase. Generas rentas digitales cada vez que alguien usa la inteligencia artificial.
        </p>

        <AgentNight />

        <ul className="mt-10 space-y-3 text-base text-[#1E1E24]">
          <li>Describes tu idea en una frase.</li>
          <li>LYRA arma la herramienta.</li>
          <li>Eliges Started, Pro, Founder o Corporate.</li>
        </ul>

        <Link
          href={join}
          className="mt-12 inline-flex w-fit rounded-md bg-[#312F2F] px-5 py-3 text-sm font-medium text-white"
        >
          Crear mi cuenta
        </Link>
        <Link href={brand.links.login} className="mt-4 text-sm text-[#5C5854] underline underline-offset-4">
          Ya tengo cuenta
        </Link>
      </section>
    </main>
  );
}
