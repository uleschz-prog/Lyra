import { Bot, Check, Code2, GraduationCap, Palette, Sparkles } from "lucide-react";
import Link from "next/link";

import { BuilderConsole } from "@/components/landing/builder-console";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { VegaMascot } from "@/components/vega/vega-mark";
import { brand } from "@/config/brand";
import { PromoBadge } from "@/components/plan/rebuy-promo";
import { signupPlans, type PlanSpec } from "@/config/compensation-plan";

const creations = [
  {
    id: "apps",
    title: "Apps y software",
    icon: Code2,
    copy: "Diseña herramientas digitales y prototipos funcionales con Vega. Explora la interfaz, descarga el código y sigue construyendo.",
    action: "Construye una app",
    idea: "Una app para mi negocio",
  },
  {
    id: "sitios",
    title: "Sitios web",
    icon: Palette,
    copy: "Crea experiencias web con estructura, identidad visual y contenido para tu marca, producto o próximo lanzamiento.",
    action: "Diseña un sitio",
    idea: "Un sitio web para mi estudio",
  },
  {
    id: "agentes",
    title: "Agentes de IA",
    icon: Bot,
    copy: "Configura asistentes especializados para crear, organizar y dar seguimiento, con las herramientas conectadas a tu cuenta.",
    action: "Crea un agente",
    idea: "Un agente que atienda a mis clientes",
  },
  {
    id: "academia",
    title: "LYRA Academia",
    icon: GraduationCap,
    copy: "Aprende diseño web, programación y habilidades digitales con cursos prácticos, creadores y una comunidad en crecimiento.",
    action: "Explora Academia",
    href: brand.links.academy,
    idea: "Quiero aprender diseño web y programación",
  },
];

const planIdeas: Record<string, string> = {
  STARTED: "Quiero el plan Inicio de 29",
  PRO: "Quiero el plan Negocio de 99",
  FOUNDER: "Quiero el plan Pro de 249",
};

export default function HomePage() {
  return (
    <div className="lyra-paper min-h-screen overflow-x-hidden dark:bg-[#14121C] dark:text-[#F2F0F7]">
      <SiteHeader />
      <main>
        <section className="relative mx-auto w-full max-w-7xl overflow-hidden px-4 pt-16 pb-8 sm:px-6 sm:pt-24">
          <div className="pointer-events-none absolute top-0 left-1/2 -z-10 h-[520px] w-[min(100%,1000px)] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(196,181,253,0.28),rgba(236,254,255,0.08)_50%,transparent_72%)]" aria-hidden />
          <div className="animate-lyra-rise mx-auto max-w-4xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#DDD6FE] bg-white/80 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-[#5B21B6] shadow-sm dark:border-white/12 dark:bg-[#181625]/80 dark:text-[#C4B5FD]">
              <Sparkles className="size-3.5" aria-hidden />
              DISEÑA · PROGRAMA · APRENDE · LANZA
            </span>
            <h1 className="mt-6 text-[2.85rem] font-semibold leading-[1.02] tracking-tight text-[#1E1E24] sm:text-7xl lg:text-[5.25rem] dark:text-[#F2F0F7]">
              Tu próxima gran idea empieza en{" "}
              <span className="bg-gradient-to-r from-[#7C3AED] via-[#5B21B6] to-[#0891B2] bg-clip-text text-transparent">LYRA</span>
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-[#5C5854] sm:text-2xl sm:leading-relaxed dark:text-[#C7C3D4]">
              Diseña sitios y apps, crea agentes de IA y contenido visual, y aprende diseño web y programación en LYRA Academia. Convierte tus ideas en proyectos digitales con Vega y una comunidad que te impulsa.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs font-medium text-[#5C5854] dark:text-[#C7C3D4]">
              {["Creación con IA", "Formación práctica", "Comunidad de partners"].map((item) => (
                <span key={item} className="rounded-full border border-[#E7E2DA] bg-white/75 px-3 py-1.5 dark:border-white/10 dark:bg-[#181625]/70">{item}</span>
              ))}
            </div>
          </div>
          <div className="relative mx-auto mt-9 max-w-4xl rounded-[2rem] border border-white/80 bg-white/55 p-2 shadow-[0_32px_100px_-44px_rgba(76,29,149,0.32)] backdrop-blur-xl dark:border-white/10 dark:bg-[#181625]/55 sm:mt-12 sm:p-4">
            <div className="mb-1 flex items-center justify-between px-3 pt-2 text-[10px] font-semibold tracking-[0.18em] text-[#8A8680] uppercase">
              <span>Tu espacio para crear</span>
              <span className="inline-flex items-center gap-1.5 normal-case tracking-normal text-[#7C3AED]"><Sparkles className="size-3" /> Potenciado por Vega</span>
            </div>
            <BuilderConsole />
          </div>
        </section>

        <section id="crear" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-16 sm:px-6">
          <h2 className="text-5xl font-semibold tracking-tight text-[#1E1E24] sm:text-6xl dark:text-[#F2F0F7]">¿Qué vas a crear?</h2>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-[#5C5854] sm:text-lg dark:text-[#C7C3D4]">
            Un mismo lugar para construir productos digitales, crear con inteligencia artificial y aprender las habilidades que llevan tus ideas más lejos.
          </p>
          <div className="mt-10 grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {creations.map((item) => (
              <article
                key={item.id}
                id={item.id}
                className="group relative flex flex-col overflow-hidden rounded-3xl border border-[#E7E2DA] bg-white transition duration-300 hover:-translate-y-1 hover:border-[#C4B5FD] hover:shadow-[0_24px_70px_-35px_rgba(91,33,182,0.55)] dark:border-white/10 dark:bg-[#181625]"
              >
                <div className="flex min-h-[310px] flex-1 flex-col p-6 sm:p-7">
                  <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-[#F5F3FF] to-[#ECFEFF] text-[#6D28D9] transition group-hover:scale-105 dark:from-[#30254A] dark:to-[#1D3038] dark:text-[#C4B5FD]">
                    <item.icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-6 text-2xl font-semibold tracking-tight text-[#1E1E24] dark:text-[#F2F0F7]">
                    {item.title}
                  </h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-[#5C5854] sm:text-base dark:text-[#C7C3D4]">
                    {item.copy}
                  </p>
                  <Link
                    href={item.href ?? `${brand.links.register}?idea=${encodeURIComponent(item.idea)}`}
                    className="mt-6 inline-flex min-h-11 w-fit items-center rounded-xl bg-[#1E1E24] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5B21B6] dark:bg-[#EDE9FE] dark:text-[#2E1065] dark:hover:bg-white"
                  >
                    {item.action}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="planes" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24">
          <div className="grid items-stretch gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
            <div className="flex flex-col lg:pt-4">
              <h2 className="text-5xl font-semibold tracking-tight text-[#1E1E24] sm:text-6xl lg:text-[4.5rem] lg:leading-[0.95] dark:text-[#F2F0F7]">
                Elige
                <br />
                tu plan
              </h2>
              <p className="mt-8 max-w-sm text-lg leading-relaxed text-[#5C5854] sm:text-xl dark:text-[#C7C3D4]">
                Cada plan combina créditos, herramientas de IA, creación visual y acceso a LYRA Academia. Recarga cuando lo necesites desde 5 créditos: compra exactamente 50 y recibes 60. El cupo de video se renueva cada 30 días, por separado.
              </p>
              <div className="mt-10 flex flex-1 items-center justify-center lg:mt-12">
                <VegaMascot className="h-52 w-52 drop-shadow-[0_28px_48px_rgba(124,58,237,0.35)] sm:h-64 sm:w-64 lg:h-80 lg:w-80" />
              </div>
            </div>
            <div className="space-y-4">
              {signupPlans.map((plan: PlanSpec) => {
                const featured = plan.id === "PRO";
                const promo = "rebuyBefore" in plan;
                const dark = featured;
                return (
                  <article
                    key={plan.id}
                    className={
                      featured
                        ? "relative overflow-hidden bg-gradient-to-br from-[#7C3AED] via-[#6D28D9] to-[#2E1065] p-6 text-white shadow-[0_24px_70px_-24px_rgba(124,58,237,0.8)] ring-2 ring-[#C4B5FD]/60 sm:p-8"
                        : "bg-white p-6 text-[#1E1E24] sm:p-8 dark:bg-[#181625] dark:text-[#F2F0F7]"
                    }
                  >
                    {featured ? (
                      <span aria-hidden className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-[#E9D5FF]/25 blur-3xl" />
                    ) : null}
                    <div className="relative grid gap-8 sm:grid-cols-2">
                      <div>
                        <p className="flex flex-wrap items-center gap-2 text-xl">
                          {plan.label}
                          {featured ? (
                            <span className="rounded-full bg-gradient-to-r from-[#E9D5FF] to-[#C4B5FD] px-3 py-1 text-xs font-bold tracking-wide text-[#2E1065] uppercase">
                              El más elegido
                            </span>
                          ) : null}
                          {promo ? <PromoBadge /> : null}
                        </p>
                        <p className="mt-3 flex items-end">
                          <span className="text-6xl font-semibold tracking-tight sm:text-7xl">
                            {plan.quote ? "A medida" : `$${plan.price.toLocaleString("en-US")}`}
                          </span>
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className={`text-sm ${dark ? "text-white/80" : "text-[#5C5854]"}`}>Recarga flexible desde 5 créditos</span>
                          <span className="rounded-full bg-gradient-to-r from-[#7C3AED] to-[#0891B2] px-3 py-1 text-[10px] font-bold tracking-wide text-white">
                            50 → 60
                          </span>
                        </div>
                        <p className={`mt-1 text-xs ${dark ? "text-white/65" : "text-[#8A8680]"}`}>50 créditos comprados → 60 acreditados · $1 USD por crédito</p>
                        <Link
                          href={`${brand.links.register}?idea=${encodeURIComponent(planIdeas[plan.id])}`}
                          className={`mt-6 inline-flex rounded-md px-4 py-2.5 text-base font-medium ${
                            featured
                              ? "bg-white text-[#2E1065] shadow-[0_0_30px_rgba(233,213,255,0.5)]"
                              : "bg-[#312F2F] text-white dark:bg-[#EDE9FE] dark:text-[#2E1065]"
                          }`}
                        >
                          Empieza a crear
                        </Link>
                      </div>
                      <ul className="space-y-3 sm:pt-1">
                        {plan.points.filter((item) => !/^Recarga mensual|^Compra 50 créditos|^Con una recarga mensual/i.test(item)).map((item) => (
                          <li key={item} className="flex items-start gap-2 text-base">
                            <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
          <p className="mt-8 text-center text-base text-[#252525] lg:text-right dark:text-[#C7C3D4]">
            ¿Buscas soluciones para empresas?{" "}
            <Link
              href={`${brand.links.register}?idea=${encodeURIComponent("Una solución para mi empresa")}`}
              className="font-medium text-[#1E1E24] underline underline-offset-4"
            >
              Contacta a ventas
            </Link>
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
