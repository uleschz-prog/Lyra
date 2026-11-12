import { eyebrow, h2, lead } from "@/lib/builder/sections/kit";
import type { RenderCtx } from "@/lib/builder/sections/render";
import type { SectionContent, SectionItem } from "@/lib/builder/types";

export const contactCta = { label: "Contáctanos", href: "#contacto" };

export const filler = (label: string) => (index: number): SectionItem => ({ title: `${label} ${index + 1}`, text: "" });

export function base(content: SectionContent) {
  return { eyebrow: content.eyebrow ?? "", title: content.title, subtitle: content.subtitle ?? "" };
}

export function sectionHead(align: "left" | "center" = "left") {
  const center = align === "center";
  return `<div className="${center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}">
          {content.eyebrow ? <p className="${eyebrow}">{content.eyebrow}</p> : null}
          <h2 className="mt-3 ${h2}">{content.title}</h2>
          {content.subtitle ? <p className="${lead}${center ? " mx-auto" : ""}">{content.subtitle}</p> : null}
        </div>`;
}

export function navLinks(ctx: RenderCtx) {
  return ctx.plan.pages.slice(0, 6).map((page) => ({ label: page.title, href: page.path }));
}
