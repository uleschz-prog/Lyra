import Link from "next/link";
import { Bot, GraduationCap, Network } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";

const pillars = [
  {
    title: "Red",
    copy: "Un árbol legible: patrocinador, directos y profundidad, sin perder el volumen de cada nodo.",
    icon: Network,
    href: brand.links.network,
  },
  {
    title: "Academia",
    copy: "Cursos que se abren con el rango. El temario y el avance viven en el mismo backoffice.",
    icon: GraduationCap,
    href: brand.links.academy,
  },
  {
    title: "Agentes",
    copy: "Prospector, copy, cierre y mentoría. Cada consulta descuenta créditos de la billetera.",
    icon: Bot,
    href: brand.links.aiStudio,
  },
];

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(ellipse at center, black, transparent 72%)",
        }}
      />
      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link href={brand.links.home}>
          <Logo />
        </Link>
        <Button asChild variant="outline" size="sm">
          <Link href={brand.links.dashboard}>Entrar</Link>
        </Button>
      </header>

      <main className="relative mx-auto flex w-full max-w-6xl flex-col px-6 pb-20 pt-16 sm:pt-24">
        <p className="text-[11px] uppercase tracking-[0.38em] text-lyra-cyan">{brand.slogan}</p>
        <h1 className="mt-6 max-w-3xl text-5xl font-medium tracking-[0.14em] text-white sm:text-7xl">
          {brand.name}
        </h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-zinc-400">{brand.description}</p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href={brand.links.dashboard}>Abrir el backoffice</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href={brand.links.academy}>Ver la academia</Link>
          </Button>
        </div>

        <section className="mt-20 grid gap-4 md:grid-cols-3">
          {pillars.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <Link
                key={pillar.title}
                href={pillar.href}
                className="rounded-2xl border border-lyra-border bg-lyra-card p-6 shadow-[0_0_15px_rgba(124,58,237,0.15)] transition-colors hover:border-white/15"
              >
                <Icon className="h-5 w-5 text-lyra-violet" aria-hidden />
                <h2 className="mt-6 text-lg tracking-[0.12em] text-white">{pillar.title}</h2>
                <p className="mt-3 text-sm leading-6 text-zinc-400">{pillar.copy}</p>
              </Link>
            );
          })}
        </section>
      </main>
    </div>
  );
}
