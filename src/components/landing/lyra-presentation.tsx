"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  GraduationCap,
  Headphones,
  Library,
  Network,
  Play,
  Presentation,
  Sparkles,
  Wallet,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import styles from "./lyra-presentation.module.css";

type PresentationSlide = {
  id: string;
  section: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: "violet" | "cyan" | "amber" | "emerald";
  points: { title: string; text: string; icon: LucideIcon }[];
  link?: string;
  linkLabel?: string;
};

const slides: PresentationSlide[] = [
  {
    id: "vision",
    section: "Visión",
    eyebrow: "La tecnología cambia las reglas",
    title: "Las necesidades siguen. Las soluciones evolucionan.",
    description: "De objetos y filas a servicios disponibles desde una pantalla.",
    icon: Sparkles,
    accent: "violet",
    points: [
      { title: "Acceso", text: "De poseer a usar.", icon: Headphones },
      { title: "Distribución", text: "De local a plataforma.", icon: Network },
      { title: "Oportunidad", text: "Resolver mejor, crear valor.", icon: WandSparkles },
    ],
  },
  {
    id: "olas",
    section: "El cambio",
    eyebrow: "De lo físico a lo instantáneo",
    title: "Cada salto acerca la solución a las personas.",
    description: "Música, entretenimiento, movilidad y finanzas cambiaron de formato.",
    icon: Play,
    accent: "cyan",
    points: [
      { title: "Cassette → Spotify", text: "Acceso a catálogos completos.", icon: Headphones },
      { title: "Videoclub → Netflix", text: "Contenido a demanda.", icon: Library },
      { title: "Taxi → Uber · IA", text: "Servicios y trabajo bajo demanda.", icon: Bot },
    ],
  },
  {
    id: "oportunidad",
    section: "La oportunidad",
    eyebrow: "La oportunidad de la IA",
    title: "No vendas IA. Resuelve una necesidad.",
    description: "Empresas y creadores buscan producir, atender y aprender mejor.",
    icon: WandSparkles,
    accent: "amber",
    points: [
      { title: "Agentes", text: "Atención y seguimiento.", icon: Bot },
      { title: "Contenido", text: "Piezas para cada canal.", icon: Library },
      { title: "Formación", text: "Conocimiento en cursos.", icon: GraduationCap },
    ],
  },
  {
    id: "lyra",
    section: "LYRA",
    eyebrow: "El ecosistema LYRA",
    title: "Crea. Aprende. Comparte.",
    description: "Herramientas, formación y comunidad en un mismo lugar.",
    icon: Presentation,
    accent: "violet",
    points: [
      { title: "Crear", text: "Vega y Biblioteca.", icon: Sparkles },
      { title: "Aprender", text: "Academia.", icon: GraduationCap },
      { title: "Crecer", text: "Partners y comunidad.", icon: Network },
    ],
  },
  {
    id: "inicio",
    section: "Inicio",
    eyebrow: "Inicio · convierte habilidades en ofertas",
    title: "Una habilidad. Una oferta clara. Un cliente.",
    description: "Empieza con un problema concreto y valida la solución.",
    icon: Presentation,
    accent: "cyan",
    points: [
      { title: "Presencia digital", text: "Landing + contenido.", icon: WandSparkles },
      { title: "Lanzamiento", text: "Estrategia + piezas.", icon: Library },
      { title: "Automatización", text: "Mejora un proceso.", icon: Bot },
    ],
    link: "/dashboard",
    linkLabel: "Explorar Inicio",
  },
  {
    id: "vega",
    section: "Vega",
    eyebrow: "Vega · agentes para tareas concretas",
    title: "Diseña. Revisa. Implementa.",
    description: "Empaqueta una solución de atención y seguimiento para un negocio.",
    icon: Bot,
    accent: "violet",
    points: [
      { title: "Diseño", text: "Tono, FAQs y límites.", icon: Check },
      { title: "Implementación", text: "Configuración y capacitación.", icon: Headphones },
      { title: "Mejora", text: "Revisión y mantenimiento.", icon: WandSparkles },
    ],
    link: "/dashboard/super-agent",
    linkLabel: "Ver Vega",
  },
  {
    id: "biblioteca",
    section: "Biblioteca",
    eyebrow: "Biblioteca · producción creativa",
    title: "De una idea a piezas listas para editar.",
    description: "Crea conceptos visuales y conviértelos en entregables.",
    icon: Library,
    accent: "cyan",
    points: [
      { title: "Paquetes", text: "Piezas para redes.", icon: Check },
      { title: "Producto", text: "Variaciones para campañas.", icon: Sparkles },
      { title: "Previsualiza", text: "Conceptos antes de producir.", icon: Play },
    ],
    link: "/dashboard/biblioteca",
    linkLabel: "Abrir Biblioteca",
  },
  {
    id: "academia",
    section: "Academia",
    eyebrow: "Academia · conocimiento que se comparte",
    title: "Convierte experiencia en aprendizaje.",
    description: "Crea cursos gratuitos o de pago, módulo a módulo.",
    icon: GraduationCap,
    accent: "amber",
    points: [
      { title: "Comparte", text: "Publica una muestra gratuita.", icon: Library },
      { title: "Monetiza", text: "Ofrece cursos de pago.", icon: Wallet },
      { title: "Reparto", text: "93% creador · 7% LYRA; MP a cargo de LYRA.", icon: Network },
    ],
    link: "/dashboard/academy/creator",
    linkLabel: "Crear un curso",
  },
  {
    id: "partners",
    section: "Partners",
    eyebrow: "Partners · recomendar con confianza",
    title: "Comparte valor. Acompaña a tu red.",
    description: "Un enlace personal y actividad de red con reglas claras.",
    icon: Network,
    accent: "emerald",
    points: [
      { title: "Niveles", text: "20% · 10% · 5% en niveles 3–6, sobre puntos elegibles.", icon: Network },
      { title: "Ejemplo", text: "$100 → 80 puntos; 20% = $16 en nivel 1, si calificas.", icon: Wallet },
      { title: "Bono mundial", text: "Bolsa del 10%; aplican plan, actividad y cierre mensual.", icon: Sparkles },
    ],
    link: "/dashboard/network",
    linkLabel: "Ver Partners",
  },
  {
    id: "billetera",
    section: "Billetera",
    eyebrow: "Billetera · créditos flexibles",
    title: "Recarga solo lo que necesitas.",
    description: "Sin compra mensual fija. 1 crédito equivale a 1 USD.",
    icon: Wallet,
    accent: "violet",
    points: [
      { title: "Mínimo", text: "5 créditos.", icon: Check },
      { title: "Promoción", text: "Compra 50 → recibe 60.", icon: Sparkles },
      { title: "Importante", text: "El bono aplica a una compra de 50.", icon: Wallet },
    ],
    link: "/dashboard/wallet",
    linkLabel: "Abrir Billetera",
  },
  {
    id: "accion",
    section: "Siguiente paso",
    eyebrow: "Tu siguiente paso",
    title: "Empieza pequeño. Valida en el mundo real.",
    description: "Las herramientas ayudan; el valor se construye resolviendo necesidades.",
    icon: Check,
    accent: "emerald",
    points: [
      { title: "Escucha", text: "Encuentra una necesidad repetida.", icon: Headphones },
      { title: "Prototipa", text: "Crea una muestra en LYRA.", icon: WandSparkles },
      { title: "Valida", text: "Mide, mejora y recomienda con honestidad.", icon: Network },
    ],
    link: "/register",
    linkLabel: "Conocer LYRA",
  },
];

function SlideGraphic({ slide }: { slide: PresentationSlide }) {
  const nodes = {
    vision: [
      { icon: Headphones, label: "Cassette", sub: "propiedad" },
      { icon: Play, label: "Streaming", sub: "acceso" },
      { icon: Sparkles, label: "IA", sub: "capacidad" },
    ],
    olas: [
      { icon: Headphones, label: "Música", sub: "Spotify" },
      { icon: Play, label: "Video", sub: "Netflix" },
      { icon: Network, label: "Movilidad", sub: "Uber" },
      { icon: Wallet, label: "Valor", sub: "cripto" },
    ],
    oportunidad: [
      { icon: Bot, label: "Agentes", sub: "Atención" },
      { icon: WandSparkles, label: "Contenido", sub: "Producción" },
      { icon: GraduationCap, label: "Formación", sub: "Conocimiento" },
    ],
    inicio: [
      { icon: Headphones, label: "Necesidad", sub: "Escucha" },
      { icon: WandSparkles, label: "Solución", sub: "Prototipa" },
      { icon: Check, label: "Validación", sub: "Mejora" },
    ],
    vega: [
      { icon: Bot, label: "Diseñar", sub: "Agente" },
      { icon: Check, label: "Revisar", sub: "Persona" },
      { icon: Sparkles, label: "Implementar", sub: "Servicio" },
    ],
    biblioteca: [
      { icon: Sparkles, label: "Idea", sub: "Brief" },
      { icon: WandSparkles, label: "Creación", sub: "Imagen · video" },
      { icon: Library, label: "Entrega", sub: "Campaña" },
    ],
    academia: [
      { icon: GraduationCap, label: "Experiencia", sub: "Tu método" },
      { icon: Library, label: "Curso", sub: "Lecciones" },
      { icon: Wallet, label: "Oferta", sub: "Gratis o de pago" },
    ],
    accion: [
      { icon: Headphones, label: "Escucha", sub: "Detecta" },
      { icon: WandSparkles, label: "Prototipa", sub: "Construye" },
      { icon: Network, label: "Valida", sub: "Aprende" },
    ],
  } as const;
  const sequence = nodes[slide.id as keyof typeof nodes];

  if (slide.id === "lyra") {
    return (
      <div className={`${styles.visual} ${styles.ecosystemVisual}`} aria-hidden="true">
      <div className={`${styles.orbit} ${styles.orbitOne}`} />
      <div className={`${styles.orbit} ${styles.orbitTwo}`} />
        <div className={`${styles.hubNode} ${styles.floatNode}`}><Sparkles size={26} /><strong>LYRA</strong><span>tu espacio de creación</span></div>
        <div className={`${styles.satellite} ${styles.satelliteTop}`}><Bot size={19} /><span>Vega</span></div>
        <div className={`${styles.satellite} ${styles.satelliteRight}`}><GraduationCap size={19} /><span>Academia</span></div>
        <div className={`${styles.satellite} ${styles.satelliteBottom}`}><Network size={19} /><span>Partners</span></div>
        <div className={`${styles.satellite} ${styles.satelliteLeft}`}><Library size={19} /><span>Biblioteca</span></div>
        <svg className={styles.orbitLines} viewBox="0 0 480 420" fill="none">
          <path d="M240 210 240 48M240 210 420 210M240 210 240 372M240 210 60 210" stroke="currentColor" strokeDasharray="4 7" />
        </svg>
      </div>
    );
  }

  if (slide.id === "billetera") {
    return (
      <div className={`${styles.visual} ${styles.walletVisual}`} aria-hidden="true">
        <div className={styles.walletCard}>
          <div className={styles.walletCardTop}><span>LYRA · CRÉDITOS</span><Wallet size={19} /></div>
          <span className={styles.walletBigNumber}>50 <ArrowRight size={25} /> 60</span>
          <span className={styles.walletCaption}>Compra · recibes</span>
          <div className={styles.creditDots}>{Array.from({ length: 10 }, (_, index) => <i key={index} />)}</div>
        </div>
        <div className={styles.minimumBadge}><span>Desde</span><strong>5</strong><span>créditos</span></div>
        <div className={styles.noMonthly}><Check size={16} /> Sin recompra mensual fija</div>
      </div>
    );
  }

  if (slide.id === "partners") {
    return (
      <div className={`${styles.visual} ${styles.networkVisual}`} aria-hidden="true">
        <svg viewBox="0 0 520 360" className={styles.networkLines} fill="none">
          <path d="M260 62v75M260 137 105 232M260 137l155 95M105 232v58m155-153v153m155-58v58" stroke="currentColor" strokeWidth="2" strokeDasharray="5 7" />
        </svg>
        <div className={`${styles.networkPerson} ${styles.networkRoot}`}><span>Yo</span></div>
        <div className={`${styles.networkPerson} ${styles.networkChildOne}`}><span>1</span></div>
        <div className={`${styles.networkPerson} ${styles.networkChildTwo}`}><span>2</span></div>
        <div className={`${styles.networkPerson} ${styles.networkLeafOne}`}><span>3</span></div>
        <div className={`${styles.networkPerson} ${styles.networkLeafTwo}`}><span>4</span></div>
        <div className={`${styles.networkPerson} ${styles.networkLeafThree}`}><span>5</span></div>
        <div className={styles.networkLabel}>Comparte · acompaña · crece</div>
      </div>
    );
  }

  if (slide.id === "biblioteca") {
    return (
      <div className={`${styles.visual} ${styles.creativeVisual}`} aria-hidden="true">
        <div className={`${styles.creativeTile} ${styles.creativeTileLarge}`}><span>IDEA EN MOVIMIENTO</span></div>
        <div className={`${styles.creativeTile} ${styles.creativeTilePortrait}`}><WandSparkles size={26} /><span>IMAGEN</span></div>
        <div className={`${styles.creativeTile} ${styles.creativeTileVideo}`}><Play size={24} fill="currentColor" /><span>VIDEO</span></div>
        <div className={styles.creativeSpark}><Sparkles size={20} /></div>
      </div>
    );
  }

  return (
    <div className={`${styles.visual} ${slide.id === "olas" ? styles.timelineVisual : ""} ${slide.id === "oportunidad" ? styles.opportunityVisual : ""}`} aria-hidden="true">
      {slide.id === "oportunidad" ? <div className={styles.opportunityHalo}><span>IA</span><i /><i /><i /></div> : null}
      <div className={styles.flowNodes}>
        {sequence.map((node, index) => {
          const NodeIcon = node.icon;
          return (
            <div className={styles.flowStep} key={node.label} style={{ ["--node-index" as string]: index }}>
              <span className={styles.flowIcon}><NodeIcon size={21} /></span>
              <span className={styles.flowLabel}>{node.label}</span>
              <span className={styles.flowSub}>{node.sub}</span>
              {index < sequence.length - 1 ? <ArrowRight className={styles.flowArrow} size={19} /> : null}
            </div>
          );
        })}
      </div>
      {slide.id === "olas" ? <div className={styles.timelineCaption}>DE UN PRODUCTO A UNA EXPERIENCIA</div> : null}
      {slide.id === "vision" ? <div className={styles.visualQuote}>La innovación simplifica<br />lo que ya necesitamos.</div> : null}
      {slide.id === "oportunidad" ? <div className={styles.opportunityCaption}>NUEVOS SERVICIOS · NUEVAS FORMAS DE TRABAJAR</div> : null}
    </div>
  );
}

export function LyraPresentation() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeSlide = slides[activeIndex];

  const goTo = useCallback((index: number) => {
    const nextIndex = Math.max(0, Math.min(slides.length - 1, index));
    setActiveIndex(nextIndex);
    window.history.pushState(null, "", `#${slides[nextIndex].id}`);
  }, []);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const initialIndex = slides.findIndex((slide) => slide.id === hash);

    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, select, [contenteditable='true']")
      ) return;
      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        if (
          event.key === " " &&
          event.target instanceof HTMLElement &&
          event.target.closest("button, a")
        ) return;
        event.preventDefault();
        setActiveIndex((index) => {
          const next = Math.min(slides.length - 1, index + 1);
          window.history.pushState(null, "", `#${slides[next].id}`);
          return next;
        });
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        setActiveIndex((index) => {
          const next = Math.max(0, index - 1);
          window.history.pushState(null, "", `#${slides[next].id}`);
          return next;
        });
      } else if (event.key === "Home") {
        goTo(0);
      } else if (event.key === "End") {
        goTo(slides.length - 1);
      }
    }

    function onPopState() {
      const currentId = window.location.hash.slice(1);
      const index = slides.findIndex((slide) => slide.id === currentId);
      if (index >= 0) setActiveIndex(index);
    }

    if (initialIndex >= 0) window.requestAnimationFrame(() => setActiveIndex(initialIndex));

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("popstate", onPopState);
    };
  }, [goTo]);

  return (
    <main className={styles.deck} style={{ ["--slide-accent" as string]: accentColors[activeSlide.accent] }}>
      <header className={`${styles.topbar} print:hidden`}>
        <Link href="/" className="flex items-center gap-2 text-sm font-bold tracking-[0.18em] text-white">
          <span className="grid size-8 place-items-center rounded-xl bg-white/10 text-violet-200">L</span>
          LYRA
        </Link>
        <div className="hidden items-center gap-1 overflow-x-auto md:flex" aria-label="Secciones de la presentación">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => goTo(index)}
              aria-current={index === activeIndex ? "step" : undefined}
              className={`shrink-0 rounded-full px-3 py-2 text-xs transition ${
                index === activeIndex ? "bg-white text-[#1E1E24]" : "text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              {slide.section}
            </button>
          ))}
        </div>
        <button
          type="button"
          title="Abre el diálogo de impresión; elige “Guardar como PDF” para descargar la presentación."
          aria-label="Descargar la presentación como PDF"
          onClick={() => window.print()}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 text-xs font-semibold text-white transition hover:bg-white/20"
        >
          <Presentation size={15} aria-hidden />
          <span className="hidden sm:inline">Descargar PDF</span>
          <span className="sm:hidden">PDF</span>
        </button>
      </header>

      <div className={styles.progressTrack} aria-hidden>
        <div className={styles.progressFill} style={{ width: `${((activeIndex + 1) / slides.length) * 100}%` }} />
      </div>

      <div className={styles.slides}>
        {slides.map((slide, index) => {
          const SlideIcon = slide.icon;
          const isActive = index === activeIndex;
          return (
            <section
              key={slide.id}
              id={slide.id}
              aria-label={`${index + 1}. ${slide.section}`}
              aria-hidden={!isActive}
              className={`${styles.slide} ${isActive ? styles.activeSlide : ""}`}
              hidden={!isActive}
            >
              <div className={styles.slideContent}>
                <div className={styles.slideMain}>
                  <div className={styles.slideHeading}>
                    <div className={styles.eyebrow}>
                      <span className={styles.iconOrb}><SlideIcon size={19} aria-hidden /></span>
                      <span>{slide.eyebrow}</span>
                      <span className={styles.sectionBadge}>{slide.section}</span>
                    </div>
                    <h1>{slide.title}</h1>
                    <p className={styles.description}>{slide.description}</p>
                    {slide.link && slide.linkLabel ? (
                      <Link href={slide.link} className={styles.slideCta}>
                        {slide.linkLabel}<ArrowRight size={15} aria-hidden />
                      </Link>
                    ) : null}
                  </div>

                </div>

                <SlideGraphic slide={slide} />

                <div className={styles.cardGrid}>
                  {slide.points.map((point, pointIndex) => {
                    const PointIcon = point.icon;
                    return (
                      <article key={point.title} className={styles.card} style={{ ["--card-index" as string]: pointIndex }}>
                        <span className={styles.cardIcon}><PointIcon size={17} aria-hidden /></span>
                        <span className={styles.cardCopy}><strong>{point.title}</strong><span>{point.text}</span></span>
                      </article>
                    );
                  })}
                </div>

              </div>
              <div className={styles.ambientOrb} aria-hidden />
            </section>
          );
        })}
      </div>

      <nav className={`${styles.controls} print:hidden`} aria-label="Navegación de diapositivas">
        <div className={styles.dotNav}>
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`Ir a diapositiva ${index + 1}: ${slide.section}`}
              aria-current={index === activeIndex ? "step" : undefined}
              className={`${styles.dot} ${index === activeIndex ? styles.activeDot : ""}`}
            />
          ))}
        </div>
        <span className={styles.keyboardHint}><ArrowLeft size={13} /> <ArrowRight size={13} /> para navegar</span>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Diapositiva anterior" disabled={activeIndex === 0} onClick={() => goTo(activeIndex - 1)} className={styles.arrowButton}>
            <ArrowLeft size={18} aria-hidden />
          </button>
          {activeIndex === 0 ? (
            <button type="button" onClick={() => goTo(1)} className={styles.startButton}>
              Comenzar <ArrowDown size={15} aria-hidden />
            </button>
          ) : (
            <button type="button" aria-label="Siguiente diapositiva" disabled={activeIndex === slides.length - 1} onClick={() => goTo(activeIndex + 1)} className={styles.arrowButton}>
              <ArrowRight size={18} aria-hidden />
            </button>
          )}
        </div>
      </nav>
    </main>
  );
}

const accentColors: Record<PresentationSlide["accent"], string> = {
  violet: "#A78BFA",
  cyan: "#67E8F9",
  amber: "#FCD34D",
  emerald: "#6EE7B7",
};
