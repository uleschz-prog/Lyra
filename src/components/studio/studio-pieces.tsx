"use client";

import {
  Clapperboard,
  Film,
  Image as ImageIcon,
  Layers,
  Play,
  Sparkles,
  Upload,
  Wand2,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/* ---------- Datos del patio de juegos creativo ---------- */

export type StylePreset = {
  id: string;
  name: string;
  vibe: string;
  /** Fondo del degradado para la miniatura animada. */
  gradient: string;
  accent: string;
};

export const videoStyles: StylePreset[] = [
  { id: "cine", name: "Cine", vibe: "Luces bajas, drama", gradient: "from-[#1E1B4B] via-[#4C1D95] to-[#0F0A1E]", accent: "#A78BFA" },
  { id: "producto", name: "Producto", vibe: "Estudio limpio", gradient: "from-[#FFF7ED] via-[#FDE68A] to-[#FCD34D]", accent: "#B45309" },
  { id: "vlog", name: "Vlog", vibe: "Cámara en mano", gradient: "from-[#ECFEFF] via-[#A5F3FC] to-[#22D3EE]", accent: "#0E7490" },
  { id: "neon", name: "Neón", vibe: "Ciudad de noche", gradient: "from-[#4C1D95] via-[#DB2777] to-[#F59E0B]", accent: "#FBCFE8" },
  { id: "natural", name: "Natural", vibe: "Luz de día", gradient: "from-[#ECFDF5] via-[#A7F3D0] to-[#34D399]", accent: "#047857" },
  { id: "retro", name: "Retro", vibe: "VHS y grano", gradient: "from-[#FEF3C7] via-[#FDBA74] to-[#FB7185]", accent: "#9A3412" },
];

export const imageStyles: StylePreset[] = [
  { id: "editorial", name: "Editorial", vibe: "Revista premium", gradient: "from-[#F7F5F2] via-[#EDE9FE] to-[#C4B5FD]", accent: "#5B21B6" },
  { id: "cine", name: "Cine", vibe: "Contraste alto", gradient: "from-[#111114] via-[#312E81] to-[#1E1B4B]", accent: "#A5B4FC" },
  { id: "producto", name: "Producto", vibe: "Fondo infinito", gradient: "from-[#FFFFFF] via-[#F5F3FF] to-[#DDD6FE]", accent: "#7C3AED" },
  { id: "ilustracion", name: "Ilustración", vibe: "Trazo artístico", gradient: "from-[#FDF2F8] via-[#FBCFE8] to-[#F472B6]", accent: "#BE185D" },
  { id: "tresd", name: "3D", vibe: "Render suave", gradient: "from-[#ECFEFF] via-[#BAE6FD] to-[#60A5FA]", accent: "#1D4ED8" },
  { id: "minimal", name: "Minimal", vibe: "Menos es más", gradient: "from-[#FAFAF9] via-[#F5F5F4] to-[#E7E5E4]", accent: "#44403C" },
];

export type VideoTemplate = {
  id: string;
  title: string;
  tag: string;
  duration: string;
  script: string;
  detail: string;
  styleId: string;
  gradient: string;
};

export const videoTemplates: VideoTemplate[] = [
  {
    id: "presentacion",
    title: "Preséntate en 30 segundos",
    tag: "Marca personal",
    duration: "30 s",
    script:
      "Hola, soy [tu nombre]. Ayudo a [tu público] a [resultado]. En LYRA uso agentes que crean, venden y dan seguimiento por mí. Escríbeme y empezamos.",
    detail: "Tu nombre, tu oferta y un botón de contacto",
    styleId: "vlog",
    gradient: "from-[#ECFEFF] via-[#A5F3FC] to-[#22D3EE]",
  },
  {
    id: "reel-producto",
    title: "Reel de producto",
    tag: "Ventas",
    duration: "15 s",
    script:
      "Mira lo que acaba de llegar. [Producto] resuelve [problema] en segundos. Pídelo hoy y llévate [beneficio].",
    detail: "El producto en primer plano y su precio",
    styleId: "producto",
    gradient: "from-[#FFF7ED] via-[#FDE68A] to-[#FCD34D]",
  },
  {
    id: "historia-red",
    title: "Historia de tu red",
    tag: "Reclutamiento",
    duration: "30 s",
    script:
      "Empecé solo con una idea. Hoy mi red crece todos los días con agentes que trabajan mientras duermo. Te enseño cómo en una llamada.",
    detail: "Tu equipo, tus rangos y una invitación",
    styleId: "cine",
    gradient: "from-[#1E1B4B] via-[#4C1D95] to-[#0F0A1E]",
  },
  {
    id: "testimonio",
    title: "Testimonio cliente",
    tag: "Confianza",
    duration: "60 s",
    script:
      "Antes perdía clientes por no dar seguimiento. Con LYRA mi equipo automático responde, agenda y cierra. Cambió mi negocio por completo.",
    detail: "Nombre del cliente y su resultado",
    styleId: "natural",
    gradient: "from-[#ECFDF5] via-[#A7F3D0] to-[#34D399]",
  },
  {
    id: "tutorial",
    title: "Mini tutorial",
    tag: "Educativo",
    duration: "60 s",
    script:
      "Paso uno: entra a LYRA. Paso dos: escribe lo que necesitas. Paso tres: deja que el agente lo resuelva. Así de simple.",
    detail: "Los tres pasos en pantalla",
    styleId: "vlog",
    gradient: "from-[#EEF2FF] via-[#C7D2FE] to-[#818CF8]",
  },
  {
    id: "promo",
    title: "Promo con urgencia",
    tag: "Oferta",
    duration: "15 s",
    script:
      "Últimas [X] horas. [Oferta] con [descuento] solo hoy. Toca el enlace antes de que se acabe.",
    detail: "La oferta, el descuento y la cuenta regresiva",
    styleId: "neon",
    gradient: "from-[#4C1D95] via-[#DB2777] to-[#F59E0B]",
  },
];

export type ImageTemplate = {
  id: string;
  title: string;
  tag: string;
  detail: string;
  styleId: string;
  gradient: string;
};

export const imageTemplates: ImageTemplate[] = [
  {
    id: "post",
    title: "Post para redes",
    tag: "Contenido",
    detail: "Titular grande, tu logo abajo a la derecha y fondo limpio.",
    styleId: "editorial",
    gradient: "from-[#F7F5F2] via-[#EDE9FE] to-[#C4B5FD]",
  },
  {
    id: "flyer",
    title: "Flyer de evento",
    tag: "Promoción",
    detail: "Nombre del evento, fecha, lugar y código QR.",
    styleId: "cine",
    gradient: "from-[#111114] via-[#312E81] to-[#1E1B4B]",
  },
  {
    id: "producto",
    title: "Ficha de producto",
    tag: "Ventas",
    detail: "El producto centrado, precio y sello de garantía.",
    styleId: "producto",
    gradient: "from-[#FFFFFF] via-[#F5F3FF] to-[#DDD6FE]",
  },
  {
    id: "cita",
    title: "Frase inspiradora",
    tag: "Marca",
    detail: "Una frase corta, tu firma y mucho aire.",
    styleId: "minimal",
    gradient: "from-[#FAFAF9] via-[#F5F5F4] to-[#E7E5E4]",
  },
  {
    id: "portada",
    title: "Portada de curso",
    tag: "Academia",
    detail: "El título del curso, módulo y sello de LYRA.",
    styleId: "tresd",
    gradient: "from-[#ECFEFF] via-[#BAE6FD] to-[#60A5FA]",
  },
  {
    id: "avatar",
    title: "Avatar con estilo",
    tag: "Perfil",
    detail: "Tu cara o logo, en un círculo con fondo de color.",
    styleId: "ilustracion",
    gradient: "from-[#FDF2F8] via-[#FBCFE8] to-[#F472B6]",
  },
];

/* ---------- Piezas visuales reutilizables ---------- */

/** Miniatura animada tipo "preview" que late y muestra un play. */
export function PreviewCard({
  gradient,
  label,
  sub,
  icon,
  ratio = "aspect-video",
  className,
}: {
  gradient: string;
  label: string;
  sub?: string;
  icon?: ReactNode;
  ratio?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group/preview relative flex w-full items-end overflow-hidden rounded-2xl bg-gradient-to-br p-3 text-white shadow-[0_18px_40px_-24px_rgba(30,30,36,0.6)] ring-1 ring-black/5",
        gradient,
        ratio,
        className,
      )}
    >
      <span className="pointer-events-none absolute -top-8 -right-6 h-24 w-24 rounded-full bg-white/25 blur-2xl vega-pulse" aria-hidden />
      {icon ? <span className="absolute top-3 left-3 text-white/80">{icon}</span> : null}
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-white/25 backdrop-blur transition-transform duration-300 group-hover/preview:scale-110">
          <Play className="h-4 w-4 translate-x-[1px] fill-white text-white" aria-hidden />
        </span>
      </span>
      <div className="relative">
        <p className="text-xs font-semibold drop-shadow">{label}</p>
        {sub ? <p className="text-[10px] text-white/80 drop-shadow">{sub}</p> : null}
      </div>
    </div>
  );
}

/** Sección con encabezado y contenido. */
export function StudioSection({
  eyebrow,
  title,
  hint,
  children,
}: {
  eyebrow: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-[#E7E2DA] bg-white p-4 sm:p-6">
      <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-[#8A8680]">{eyebrow}</p>
      <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-[#1E1E24]">{title}</h2>
      {hint ? <p className="mt-1 max-w-2xl text-sm text-[#5C5854]">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Encabezado de sección con degradado y chispa. */
export function StudioHero({
  title,
  subtitle,
  stat,
}: {
  title: string;
  subtitle: string;
  stat?: string;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#4C1D95] via-[#7C3AED] to-[#DB2777] p-6 text-white sm:p-8">
      <span className="pointer-events-none absolute -top-16 -right-10 h-56 w-56 rounded-full bg-white/20 blur-3xl" aria-hidden />
      <span className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-[#22D3EE]/30 blur-3xl" aria-hidden />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-medium tracking-[0.22em] uppercase text-white/70">
            <Wand2 className="h-3.5 w-3.5" aria-hidden />
            Estudio creativo
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/80">{subtitle}</p>
        </div>
        {stat ? (
          <span className="rounded-full bg-white/15 px-4 py-2 text-xs font-medium backdrop-blur ring-1 ring-white/25">
            {stat}
          </span>
        ) : null}
      </div>
    </section>
  );
}

/** Tarjeta de plantilla clicable, con miniatura animada. */
export function TemplateCard({
  gradient,
  title,
  tag,
  meta,
  icon,
  onClick,
  active,
}: {
  gradient: string;
  title: string;
  tag: string;
  meta?: string;
  icon?: ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group/template flex flex-col gap-3 rounded-2xl border bg-white p-3 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-30px_rgba(124,58,237,0.7)]",
        active ? "border-[#7C3AED] ring-2 ring-[#7C3AED]/30" : "border-[#E7E2DA] hover:border-[#C4B5FD]",
      )}
    >
      <PreviewCard gradient={gradient} label={tag} sub={meta} icon={icon} />
      <div>
        <p className="text-sm font-semibold text-[#1E1E24]">{title}</p>
        <p className="mt-0.5 text-xs text-[#8A8680]">{tag}{meta ? ` · ${meta}` : ""}</p>
      </div>
    </button>
  );
}

/** Fila horizontal de estilos con miniatura. */
export function StylePicker({
  styles,
  value,
  onChange,
  label,
}: {
  styles: StylePreset[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div className="mt-4">
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-[#8A8680]">
        <Layers className="h-3.5 w-3.5" aria-hidden />
        {label}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {styles.map((style) => {
          const active = value === style.id;
          return (
            <button
              key={style.id}
              type="button"
              onClick={() => onChange(style.id)}
              className={cn(
                "group/style overflow-hidden rounded-xl border text-left transition-all duration-300",
                active ? "border-[#7C3AED] ring-2 ring-[#7C3AED]/30" : "border-[#E7E2DA] hover:border-[#C4B5FD]",
              )}
            >
              <div className={cn("relative h-14 w-full bg-gradient-to-br", style.gradient)}>
                <span className="pointer-events-none absolute inset-0 grid place-items-center text-[10px] font-semibold text-white/90 opacity-0 transition-opacity group-hover/style:opacity-100">
                  Ver
                </span>
              </div>
              <p className="px-2 py-1.5 text-[11px] font-medium text-[#1E1E24]">{style.name}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Botón grande de generar con brillo. */
export function GenerateButton({
  label,
  busyLabel,
  disabled,
  onClick,
}: {
  label: string;
  busyLabel: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group/gen relative mt-5 inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-[#7C3AED] via-[#8B5CF6] to-[#DB2777] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_-18px_rgba(124,58,237,0.9)] transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 sm:w-auto"
    >
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover/gen:translate-x-full" aria-hidden />
      <Sparkles className="h-4 w-4" aria-hidden />
      {disabled ? busyLabel : label}
    </button>
  );
}

export const studioIcons = { Film, ImageIcon, Clapperboard, Zap, Upload };
