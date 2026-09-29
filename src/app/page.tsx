import { Check } from "lucide-react";
import Link from "next/link";

import { BuilderConsole } from "@/components/landing/builder-console";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { PromoBadge, RebuyPromo } from "@/components/plan/rebuy-promo";
import { brand } from "@/config/brand";
import { signupPlans } from "@/config/compensation-plan";

const creations = [
  {
    id: "apps",
    title: "Apps",
    copy: "Convierte cualquier idea en una app totalmente funcional, con backend, autenticación, pagos y hosting ya incluidos. Sin configuración, sin ingenieros, sin esperas.",
    action: "Crea una app",
    idea: "Una app para mi negocio",
  },
  {
    id: "sitios",
    title: "Sitios web",
    copy: "Crea un sitio web para cualquier necesidad. Diseño generado por IA, dominio personalizado y listo para publicarse desde el primer día.",
    action: "Crea un sitio web",
    idea: "Un sitio web para mi estudio",
  },
  {
    id: "agentes",
    title: "Agentes de IA",
    copy: "Crea un agente 24/7 que se conecta a tus herramientas, toma acción real y trabaja mientras duermes. Sin dolores de cabeza con las integraciones.",
    action: "Crea un agente de IA",
    idea: "Un agente que atienda a mis clientes",
  },
];

const planIdeas = {
  STARTED: "Quiero el plan Started de 99",
  PRO: "Quiero el plan Pro de 499",
  FOUNDER: "Quiero el plan Founder de 1000",
  CORPORATE: "Quiero el plan Corporate de 5000",
} as const;

export default function HomePage() {
  return (
    <div className="lyra-paper min-h-screen overflow-x-hidden">
      <SiteHeader />
      <main>
        <section className="mx-auto w-full max-w-7xl px-4 pt-16 pb-8 sm:px-6 sm:pt-24">
          <div className="animate-lyra-rise mx-auto max-w-3xl text-center">
            <h1 className="text-[2.85rem] font-semibold tracking-tight text-[#1E1E24] sm:text-7xl lg:text-[5rem] lg:leading-[1.05]">
              Construye aplicaciones, agentes e ideas sin programar
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-[#252525] sm:text-3xl sm:leading-snug">
              Describe en lenguaje natural lo que necesitas. LYRA autogenera la interfaz, las bases de datos, los
              agentes y los flujos de trabajo en un instante.
            </p>
          </div>
          <BuilderConsole />
        </section>

        <section id="crear" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-16 sm:px-6">
          <h2 className="text-5xl font-semibold tracking-tight text-[#1E1E24] sm:text-6xl">¿Qué vas a crear?</h2>
          <p className="mt-3 max-w-2xl text-base text-[#252525] sm:text-lg">
            Sea lo que sea que imagines, puedes crearlo en LYRA.
          </p>
          <div className="mt-10 grid items-stretch gap-4 lg:grid-cols-3">
            {creations.map((item) => (
              <article
                key={item.id}
                id={item.id}
                className="group flex flex-col bg-white transition-colors duration-200 hover:bg-[#7C3AED]"
              >
                <div className="flex min-h-[300px] flex-1 flex-col p-6 sm:p-8">
                  <h3 className="text-4xl font-semibold tracking-tight text-[#1E1E24] transition-colors duration-200 group-hover:text-white">
                    {item.title}
                  </h3>
                  <p className="mt-8 max-w-sm text-base leading-relaxed text-[#1E1E24] transition-colors duration-200 group-hover:text-white/90 sm:text-lg">
                    {item.copy}
                  </p>
                  <Link
                    href={`${brand.links.register}?idea=${encodeURIComponent(item.idea)}`}
                    className="mt-10 inline-flex w-fit items-center rounded-md bg-[#312F2F] px-4 py-2.5 text-base font-medium text-white transition-colors duration-200 group-hover:bg-white group-hover:text-[#1E1E24]"
                  >
                    {item.action}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="planes" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
            <div className="lg:pt-4">
              <h2 className="text-5xl font-semibold tracking-tight text-[#1E1E24] sm:text-6xl lg:text-[4.5rem] lg:leading-[0.95]">
                Elige
                <br />
                tu plan
              </h2>
              <p className="mt-8 max-w-sm text-xl leading-snug text-[#1E1E24] sm:text-2xl">
                Started entra con $99, Pro con $499, Founder con $1,000 y Corporate con $5,000. Un crédito equivale a $1. Con 3 directos activos quedas exento de recompra.
              </p>
            </div>
            <div className="space-y-4">
              {signupPlans.map((plan) => {
                const featured = plan.id === "FOUNDER";
                const corporate = plan.id === "CORPORATE";
                const promo = "rebuyBefore" in plan;
                const dark = featured || corporate;
                return (
                  <article
                    key={plan.id}
                    className={
                      featured
                        ? "bg-[#7C3AED] p-6 text-white sm:p-8"
                        : corporate
                          ? "bg-[#1E1E24] p-6 text-white sm:p-8"
                          : "bg-white p-6 text-[#1E1E24] sm:p-8"
                    }
                  >
                    <div className="grid gap-8 sm:grid-cols-2">
                      <div>
                        <p className="flex flex-wrap items-center gap-2 text-xl">
                          {plan.label}
                          {promo ? <PromoBadge /> : null}
                        </p>
                        <p className="mt-3 flex items-end">
                          <span className="text-6xl font-semibold tracking-tight sm:text-7xl">${plan.price.toLocaleString("en-US")}</span>
                        </p>
                        {promo ? (
                          <RebuyPromo before={plan.rebuyBefore} now={plan.rebuy} />
                        ) : (
                          <p className={`mt-2 text-base ${dark ? "text-white/80" : "text-[#5C5854]"}`}>
                            {"rebuyCredits" in plan
                              ? `${plan.credits.toLocaleString("en-US")} créditos · mensualidad de $${plan.rebuy} con ${plan.rebuyCredits} créditos`
                              : plan.rebuy > 0
                                ? `Recarga mínima de $${plan.rebuy} al mes siguiente`
                                : "10,000 créditos · libre de recompra"}
                          </p>
                        )}
                        <Link
                          href={`${brand.links.register}?idea=${encodeURIComponent(planIdeas[plan.id])}`}
                          className={`mt-6 inline-flex rounded-md px-4 py-2.5 text-base font-medium ${
                            corporate ? "bg-white text-[#1E1E24]" : "bg-[#312F2F] text-white"
                          }`}
                        >
                          Empieza a crear
                        </Link>
                      </div>
                      <ul className="space-y-3 sm:pt-1">
                        {plan.points.filter((item) => !/^Recarga mínima|^Mensualidad/i.test(item)).map((item) => (
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
          <p className="mt-8 text-center text-base text-[#252525] lg:text-right">
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
