// Testimonios, precios, preguntas, galería, equipo y nosotros.
import { anchorOf, card, container, cta, eyebrow, header, iconMap, iconsFor, items, visualPanel, withIcons } from "@/lib/builder/sections/kit";
import { moduleSource, type SectionTemplate } from "@/lib/builder/sections/render";
import { base, contactCta, filler, sectionHead } from "@/lib/builder/sections/site-kit";

const gradients = `const gradients = [
  "bg-[linear-gradient(135deg,var(--color-primary),var(--color-accent))]",
  "bg-[linear-gradient(160deg,var(--color-surface-2),var(--color-primary))]",
  "bg-[linear-gradient(200deg,var(--color-accent),var(--color-surface-2))]",
];`;

export const proofTemplates: Record<string, SectionTemplate> = {
  "testimonials-grid": (s) => {
    const list = items(s.content, 3, filler("Cliente")).slice(0, 6);
    return moduleSource({
      name: s.name,
      imports: header(["Star"]),
      content: { ...base(s.content), items: list },
      body: `<section id="${anchorOf(s, "testimonios")}" className="py-20 sm:py-28">
      <div className="${container}">
        ${sectionHead("center")}
        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {content.items.map((item) => (
            <figure key={item.title + (item.text ?? "")} className="${card} flex flex-col">
              <div className="flex gap-0.5 text-accent">{[0, 1, 2, 3, 4].map((star) => <Star key={star} className="size-4 fill-current" />)}</div>
              <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-ink">“{item.text}”</blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-surface-2 text-sm font-bold text-primary">{item.title.slice(0, 1)}</span>
                <span>
                  <span className="block text-sm font-semibold text-ink">{item.title}</span>
                  {item.meta ? <span className="block text-xs text-muted">{item.meta}</span> : null}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>`,
    });
  },

  "testimonial-spotlight": (s) => {
    const list = items(s.content, 1, filler("Cliente")).slice(0, 1);
    return moduleSource({
      name: s.name,
      imports: header(["Quote"]),
      content: { eyebrow: s.content.eyebrow ?? "", item: list[0] },
      body: `<section id="${anchorOf(s, "testimonios")}" className="bg-surface-2 py-20 sm:py-28">
      <div className="${container} max-w-4xl text-center">
        <Quote className="mx-auto size-10 text-primary" />
        {content.eyebrow ? <p className="mt-4 ${eyebrow}">{content.eyebrow}</p> : null}
        <blockquote className="mt-6 font-display text-2xl font-medium leading-snug text-ink sm:text-4xl">“{content.item.text}”</blockquote>
        <p className="mt-8 text-sm font-semibold text-ink">{content.item.title}</p>
        {content.item.meta ? <p className="text-sm text-muted">{content.item.meta}</p> : null}
      </div>
    </section>`,
    });
  },

  "pricing-tiers": (s) => {
    const list = items(s.content, 3, filler("Plan")).slice(0, 3);
    return moduleSource({
      name: s.name,
      imports: header(["Check"], { link: true }),
      content: {
        ...base(s.content),
        items: list.map((item) => ({ ...item, features: (item.text ?? "").split(/[;•\n]/).map((part) => part.trim()).filter(Boolean) })),
        cta: cta(s.content.cta, contactCta),
        note: s.content.note ?? "",
      },
      body: `<section id="${anchorOf(s, "precios")}" className="py-20 sm:py-28">
      <div className="${container}">
        ${sectionHead("center")}
        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {content.items.map((plan, index) => {
            const featured = index === 1;
            return (
              <article key={plan.title} className={"flex flex-col rounded-card border p-7 " + (featured ? "border-primary bg-primary text-primary-ink shadow-card lg:-translate-y-3" : "border-line bg-surface text-ink")}>
                <p className="font-display text-lg font-semibold">{plan.title}</p>
                {plan.meta ? <p className={"mt-1 text-sm " + (featured ? "opacity-80" : "text-muted")}>{plan.meta}</p> : null}
                <p className="mt-6 font-display text-4xl font-bold tracking-tight">{plan.price || "A cotizar"}</p>
                <ul className="mt-6 flex-1 space-y-3 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0" />{feature}</li>
                  ))}
                </ul>
                <Link to={content.cta.href} className={"mt-8 inline-flex justify-center rounded-btn px-5 py-3 text-sm font-semibold " + (featured ? "bg-primary-ink text-primary" : "bg-primary text-primary-ink")}>{content.cta.label}</Link>
              </article>
            );
          })}
        </div>
        {content.note ? <p className="mt-8 text-center text-xs text-muted">{content.note}</p> : null}
      </div>
    </section>`,
    });
  },

  "pricing-list": (s) => {
    const list = items(s.content, 4, filler("Servicio")).slice(0, 12);
    return moduleSource({
      name: s.name,
      imports: "",
      content: { ...base(s.content), items: list, note: s.content.note ?? "" },
      body: `<section id="${anchorOf(s, "precios")}" className="bg-surface py-20 sm:py-28">
      <div className="${container} max-w-3xl">
        ${sectionHead("center")}
        <dl className="mt-12 divide-y divide-line rounded-card border border-line bg-bg">
          {content.items.map((item) => (
            <div key={item.title} className="flex items-baseline justify-between gap-6 p-5">
              <dt>
                <span className="font-semibold text-ink">{item.title}</span>
                {item.text ? <span className="mt-1 block text-sm text-muted">{item.text}</span> : null}
              </dt>
              <dd className="shrink-0 font-display text-lg font-semibold text-primary">{item.price || item.meta || ""}</dd>
            </div>
          ))}
        </dl>
        {content.note ? <p className="mt-6 text-center text-xs text-muted">{content.note}</p> : null}
      </div>
    </section>`,
    });
  },

  "faq-accordion": (s) => {
    const list = items(s.content, 3, filler("Pregunta")).slice(0, 10);
    return moduleSource({
      name: s.name,
      imports: header(["ChevronDown"], { react: ["useState"] }),
      content: { ...base(s.content), items: list },
      pre: "  const [open, setOpen] = useState(0);",
      body: `<section id="${anchorOf(s, "preguntas")}" className="py-20 sm:py-28">
      <div className="${container} max-w-3xl">
        ${sectionHead("center")}
        <div className="mt-12 divide-y divide-line rounded-card border border-line bg-surface">
          {content.items.map((item, index) => (
            <div key={item.title}>
              <button type="button" onClick={() => setOpen(open === index ? -1 : index)} className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left" aria-expanded={open === index}>
                <span className="font-semibold text-ink">{item.title}</span>
                <ChevronDown className={"size-5 shrink-0 text-muted transition " + (open === index ? "rotate-180" : "")} />
              </button>
              {open === index ? <p className="px-6 pb-6 text-sm leading-relaxed text-muted">{item.text}</p> : null}
            </div>
          ))}
        </div>
      </div>
    </section>`,
    });
  },

  "faq-columns": (s) => {
    const list = items(s.content, 4, filler("Pregunta")).slice(0, 8);
    return moduleSource({
      name: s.name,
      imports: "",
      content: { ...base(s.content), items: list },
      body: `<section id="${anchorOf(s, "preguntas")}" className="border-t border-line py-20 sm:py-28">
      <div className="${container} grid gap-12 lg:grid-cols-3">
        ${sectionHead()}
        <dl className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:col-span-2">
          {content.items.map((item) => (
            <div key={item.title}>
              <dt className="font-display text-lg font-semibold text-ink">{item.title}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted">{item.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>`,
    });
  },

  "gallery-mosaic": (s) => {
    const list = items(s.content, 4, filler("Proyecto")).slice(0, 8);
    return moduleSource({
      name: s.name,
      imports: "",
      extra: gradients,
      content: { ...base(s.content), items: list },
      body: `<section id="${anchorOf(s, "galeria")}" className="py-20 sm:py-28">
      <div className="${container}">
        ${sectionHead()}
        <div className="mt-12 grid auto-rows-[160px] grid-cols-2 gap-3 md:grid-cols-4">
          {content.items.map((item, index) => (
            <figure key={item.title + index} className={"group relative overflow-hidden rounded-card bg-surface-2 " + (index % 5 === 0 ? "md:col-span-2 md:row-span-2" : "")}>
              {item.image ? (
                <img src={item.image} alt={item.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
              ) : (
                <div className={"h-full w-full opacity-80 " + gradients[index % 3]} />
              )}
              <figcaption className="absolute inset-x-3 bottom-3 rounded-btn bg-surface/90 px-3 py-2 text-xs font-semibold text-ink backdrop-blur">{item.title}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>`,
    });
  },

  "portfolio-cases": (s) => {
    const list = items(s.content, 2, filler("Caso")).slice(0, 4);
    return moduleSource({
      name: s.name,
      imports: header(["ArrowUpRight"]),
      extra: gradients,
      content: { ...base(s.content), items: list },
      body: `<section id="${anchorOf(s, "casos")}" className="py-20 sm:py-28">
      <div className="${container}">
        ${sectionHead()}
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {content.items.map((item, index) => (
            <article key={item.title} className="group overflow-hidden rounded-card border border-line bg-surface">
              <div className={"aspect-[16/10] " + gradients[index % 3]}>
                {item.image ? <img src={item.image} alt={item.title} className="h-full w-full object-cover" /> : null}
              </div>
              <div className="flex items-start justify-between gap-4 p-6">
                <div>
                  {item.meta ? <p className="text-xs font-semibold uppercase tracking-wider text-primary">{item.meta}</p> : null}
                  <h3 className="mt-1 font-display text-xl font-semibold text-ink">{item.title}</h3>
                  {item.text ? <p className="mt-2 text-sm text-muted">{item.text}</p> : null}
                </div>
                <ArrowUpRight className="size-5 shrink-0 text-muted transition group-hover:text-primary" />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>`,
    });
  },

  "team-grid": (s) => {
    const list = items(s.content, 3, filler("Integrante")).slice(0, 8);
    return moduleSource({
      name: s.name,
      imports: "",
      content: { ...base(s.content), items: list },
      body: `<section id="${anchorOf(s, "equipo")}" className="py-20 sm:py-28">
      <div className="${container}">
        ${sectionHead("center")}
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {content.items.map((person) => (
            <article key={person.title} className="text-center">
              <div className="mx-auto grid aspect-square w-full max-w-[220px] place-items-center overflow-hidden rounded-card bg-[linear-gradient(160deg,var(--color-surface-2),var(--color-primary))] font-display text-5xl font-bold text-primary-ink">
                {person.image ? <img src={person.image} alt={person.title} className="h-full w-full object-cover" /> : person.title.split(" ").map((part) => part[0]).slice(0, 2).join("")}
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold text-ink">{person.title}</h3>
              {person.meta ? <p className="text-sm text-primary">{person.meta}</p> : null}
              {person.text ? <p className="mt-2 text-sm text-muted">{person.text}</p> : null}
            </article>
          ))}
        </div>
      </div>
    </section>`,
    });
  },

  "about-story": (s) => {
    const c = s.content;
    const list = (c.items ?? []).filter((item) => item && item.title).slice(0, 3);
    return moduleSource({
      name: s.name,
      imports: "",
      content: { ...base(c), paragraphs: (c.note ?? "").split(/\n+/).map((part) => part.trim()).filter(Boolean), facts: list, image: c.image ?? "" },
      body: `<section id="${anchorOf(s, "nosotros")}" className="py-20 sm:py-28">
      <div className="${container} grid items-center gap-12 lg:grid-cols-2">
        ${visualPanel(c.eyebrow || c.title, list[0]?.title ?? "")}
        <div>
          ${sectionHead()}
          <div className="mt-6 space-y-4 text-base leading-relaxed text-muted">
            {content.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
          {content.facts.length ? (
            <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-line pt-6">
              {content.facts.map((fact) => (
                <div key={fact.title}>
                  <dt className="font-display text-2xl font-bold text-ink">{fact.title}</dt>
                  <dd className="text-xs text-muted">{fact.text}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>
    </section>`,
    });
  },

  "values-grid": (s) => {
    const list = withIcons(items(s.content, 3, filler("Valor")).slice(0, 6), "Heart");
    const icons = iconsFor(list, "Heart");
    return moduleSource({
      name: s.name,
      imports: header(icons),
      extra: iconMap(icons),
      content: { ...base(s.content), items: list },
      body: `<section id="${anchorOf(s, "valores")}" className="bg-surface-2 py-20 sm:py-28">
      <div className="${container}">
        ${sectionHead()}
        <div className="mt-12 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {content.items.map((item) => {
            const Icon = icons[item.icon as keyof typeof icons] ?? Heart;
            return (
              <div key={item.title} className="bg-surface p-7">
                <Icon className="size-6 text-primary" />
                <h3 className="mt-4 font-display text-lg font-semibold text-ink">{item.title}</h3>
                {item.text ? <p className="mt-2 text-sm leading-relaxed text-muted">{item.text}</p> : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>`,
    });
  },
};
