// Piezas comunes para escribir el código TSX de las secciones de la biblioteca.
import { iconOr, type IconName } from "@/lib/builder/icons";
import type { Cta, PlannedSection, SectionContent, SectionItem } from "@/lib/builder/types";

export const container = "mx-auto w-full max-w-6xl px-5 sm:px-8";
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-btn bg-primary px-6 py-3 text-sm font-semibold text-primary-ink shadow-card transition hover:-translate-y-0.5 hover:opacity-95";
export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-btn border border-line bg-surface px-6 py-3 text-sm font-semibold text-ink transition hover:bg-surface-2";
export const eyebrow = "text-xs font-semibold uppercase tracking-[0.18em] text-primary";
export const h2 = "font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl";
export const lead = "mt-4 max-w-2xl text-base leading-relaxed text-muted sm:text-lg";
export const card = "rounded-card border border-line bg-surface p-6 shadow-card";

/** Literal JS seguro del contenido (JSON es JS válido). */
export function lit(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function cta(value: Cta | undefined, fallback: Cta): Cta {
  return value && value.label && value.href ? value : fallback;
}

export function items(content: SectionContent, min: number, filler: (index: number) => SectionItem): SectionItem[] {
  const list = (content.items ?? []).filter((item) => item && item.title);
  while (list.length < min) list.push(filler(list.length));
  return list;
}

/** Íconos usados por los ítems más los fijos de la plantilla. */
export function iconsFor(list: SectionItem[], fallback: IconName, fixed: IconName[] = []) {
  const used = new Set<IconName>(fixed);
  for (const item of list) used.add(iconOr(item.icon, fallback));
  used.add(fallback);
  return [...used].sort();
}

export function withIcons(list: SectionItem[], fallback: IconName) {
  return list.map((item) => ({ ...item, icon: iconOr(item.icon, fallback) }));
}

export function header(icons: string[], options: { link?: boolean; react?: string[]; data?: boolean } = {}) {
  const lines: string[] = [];
  if (options.react?.length) lines.push(`import { ${options.react.join(", ")} } from "react";`);
  if (icons.length) lines.push(`import { ${[...new Set(icons)].sort().join(", ")} } from "lucide-react";`);
  if (options.link) lines.push(`import { Link } from "../lib/router";`);
  if (options.data) {
    lines.push(`import { useCollection } from "../lib/data";`);
    lines.push(`import { schema, stores, type Row } from "../data/stores";`);
  }
  return lines.join("\n");
}

/** Mapa de íconos para elegir por nombre en tiempo de ejecución. */
export function iconMap(icons: string[]) {
  return `const icons = { ${[...new Set(icons)].sort().join(", ")} };`;
}

export function anchorOf(section: PlannedSection, fallback: string) {
  return section.anchor && /^[a-z0-9-]{2,30}$/.test(section.anchor) ? section.anchor : fallback;
}

/** Bloque visual decorativo (sin fotos inventadas): degradado + tarjetas flotantes. */
export function visualPanel(label: string, sub: string) {
  return `<div className="relative aspect-[4/5] w-full overflow-hidden rounded-card border border-line bg-surface-2 shadow-card sm:aspect-[5/4]">
          {content.image ? (
            <img src={content.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <>
              <div className="absolute -left-16 -top-16 h-72 w-72 rounded-full bg-primary/25 blur-3xl" />
              <div className="absolute -bottom-20 right-0 h-80 w-80 rounded-full bg-accent/25 blur-3xl" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgb(0_0_0/0.06)_1px,transparent_0)] [background-size:22px_22px]" />
            </>
          )}
          <div className="absolute bottom-5 left-5 right-5 rounded-card border border-line bg-surface/90 p-4 backdrop-blur">
            <p className="text-sm font-semibold text-ink">{${lit(label)}}</p>
            <p className="mt-1 text-xs text-muted">{${lit(sub)}}</p>
          </div>
        </div>`;
}
