// Beneficios, servicios, proceso y cifras.
import { anchorOf, btnGhost, btnPrimary, card, container, cta, header, iconMap, iconsFor, items, withIcons } from "@/lib/builder/sections/kit";
import { moduleSource, type SectionTemplate } from "@/lib/builder/sections/render";
import { base, contactCta, filler, sectionHead } from "@/lib/builder/sections/site-kit";

export const featureTemplates: Record<string, SectionTemplate> = {
  "features-grid": (s) => {
    const list = withIcons(items(s.content, 3, filler("Beneficio")).slice(0, 9), "Sparkles");
    const icons = iconsFor(list, "Sparkles");
    return moduleSource({
      name: s.name,
      imports: header(icons),
      extra: iconMap(icons),
      content: { ...base(s.content), items: list },
      body: `<section id="${anchorOf(s, "beneficios")}" className="py-20 sm:py-28">
      <div className="${container}">
        ${sectionHead("center")}
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {content.items.map((item) => {
            const Icon = icons[item.icon as keyof typeof icons] ?? Sparkles;
            return (
              <article key={item.title} className="${card} transition hover:-translate-y-1">
                <span className="grid size-12 place-items-center rounded-btn bg-surface-2 text-primary"><Icon className="size-5" /></span>
                <h3 className="mt-5 font-display text-lg font-semibold text-ink">{item.title}</h3>
                {item.text ? <p className="mt-2 text-sm leading-relaxed text-muted">{item.text}</p> : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>`,
    });
  },

  "features-alternating": (s) => {
    const list = withIcons(items(s.content, 2, filler("Punto")).slice(0, 4), "CheckCircle2");
    const icons = iconsFor(list, "CheckCircle2");
    return moduleSource({
      name: s.name,
      imports: header(icons),
      extra: iconMap(icons),
      content: { ...base(s.content), items: list },
      body: `<section id="${anchorOf(s, "como-funciona")}" className="py-20 sm:py-28">
      <div className="${container}">
        ${sectionHead()}
        <div className="mt-14 space-y-6">
          {content.items.map((item, index) => {
            const Icon = icons[item.icon as keyof typeof icons] ?? CheckCircle2;
            return (
              <div key={item.title} className="grid items-center gap-8 rounded-card border border-line bg-surface p-6 sm:p-10 lg:grid-cols-2">
                <div className={index % 2 ? "lg:order-2" : ""}>
                  <span className="font-display text-sm font-semibold text-primary">{String(index + 1).padStart(2, "0")}</span>
                  <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">{item.title}</h3>
                  {item.text ? <p className="mt-3 text-base leading-relaxed text-muted">{item.text}</p> : null}
                </div>
                <div className="relative grid aspect-[16/10] place-items-center overflow-hidden rounded-card bg-surface-2">
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,var(--color-primary)_0%,transparent_60%)] opacity-15" />
                  <Icon className="size-16 text-primary" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>`,
    });
  },

  "features-bento": (s) => {
    const list = withIcons(items(s.content, 3, filler("Función")).slice(0, 5), "Layers");
    const icons = iconsFor(list, "Layers");
    // La retícula se adapta a 3, 4 o 5 tarjetas reales (sin relleno inventado).
    const layout =
      list.length === 3
        ? ["md:col-span-4 md:row-span-2", "md:col-span-2", "md:col-span-2"]
        : list.length === 4
          ? ["md:col-span-4 md:row-span-2", "md:col-span-2", "md:col-span-2", "md:col-span-6"]
          : ["md:col-span-4 md:row-span-2", "md:col-span-2", "md:col-span-2", "md:col-span-3", "md:col-span-3"];
    return moduleSource({
      name: s.name,
      imports: header(icons),
      extra: `${iconMap(icons)}\nconst spans = ${JSON.stringify(layout)};`,
      content: { ...base(s.content), items: list },
      body: `<section id="${anchorOf(s, "funciones")}" className="py-20 sm:py-28">
      <div className="${container}">
        ${sectionHead()}
        <div className="mt-12 grid auto-rows-[minmax(180px,auto)] gap-4 md:grid-cols-6">
          {content.items.map((item, index) => {
            const Icon = icons[item.icon as keyof typeof icons] ?? Layers;
            return (
              <article key={item.title} className={"group relative overflow-hidden rounded-card border border-line bg-surface p-6 shadow-card " + (spans[index] ?? "md:col-span-2")}>
                <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 transition group-hover:scale-125" />
                <Icon className="relative size-7 text-primary" />
                <h3 className={"relative mt-6 font-display font-semibold text-ink " + (index === 0 ? "text-3xl" : "text-lg")}>{item.title}</h3>
                {item.text ? <p className="relative mt-2 max-w-md text-sm leading-relaxed text-muted">{item.text}</p> : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>`,
    });
  },

  "features-checklist": (s) => {
    const list = items(s.content, 3, filler("Incluye")).slice(0, 10);
    return moduleSource({
      name: s.name,
      imports: header(["Check"], { link: true }),
      content: { ...base(s.content), items: list, cta: s.content.cta ?? null },
      body: `<section id="${anchorOf(s, "incluye")}" className="bg-surface py-20 sm:py-28">
      <div className="${container} grid gap-12 lg:grid-cols-2">
        <div>
          ${sectionHead()}
          {content.cta ? <Link to={content.cta.href} className="mt-8 ${btnPrimary}">{content.cta.label}</Link> : null}
        </div>
        <ul className="grid gap-3">
          {content.items.map((item) => (
            <li key={item.title} className="flex gap-4 rounded-card border border-line bg-bg p-4">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-ink"><Check className="size-3.5" /></span>
              <div>
                <p className="font-semibold text-ink">{item.title}</p>
                {item.text ? <p className="mt-1 text-sm text-muted">{item.text}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>`,
    });
  },

  "services-cards": (s) => {
    const list = withIcons(items(s.content, 3, filler("Servicio")).slice(0, 9), "Star");
    const icons = iconsFor(list, "Star");
    return moduleSource({
      name: s.name,
      imports: header([...icons, "ArrowRight"], { link: true }),
      extra: iconMap(icons),
      content: { ...base(s.content), items: list, cta: cta(s.content.cta, contactCta) },
      body: `<section id="${anchorOf(s, "servicios")}" className="py-20 sm:py-28">
      <div className="${container}">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          ${sectionHead()}
          <Link to={content.cta.href} className="${btnGhost}">{content.cta.label}<ArrowRight className="size-4" /></Link>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {content.items.map((item) => {
            const Icon = icons[item.icon as keyof typeof icons] ?? Star;
            return (
              <article key={item.title} className="${card} flex flex-col">
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-11 place-items-center rounded-btn bg-primary/10 text-primary"><Icon className="size-5" /></span>
                  {item.price ? <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-ink">{item.price}</span> : null}
                </div>
                <h3 className="mt-6 font-display text-xl font-semibold text-ink">{item.title}</h3>
                {item.text ? <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{item.text}</p> : null}
                {item.meta ? <p className="mt-5 border-t border-line pt-4 text-xs font-medium text-muted">{item.meta}</p> : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>`,
    });
  },

  "services-list": (s) => {
    const list = items(s.content, 3, filler("Servicio")).slice(0, 10);
    return moduleSource({
      name: s.name,
      imports: header(["ArrowUpRight"], { link: true }),
      content: { ...base(s.content), items: list, cta: cta(s.content.cta, contactCta) },
      body: `<section id="${anchorOf(s, "servicios")}" className="py-20 sm:py-28">
      <div className="${container} grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">${sectionHead()}</div>
        <ol className="divide-y divide-line border-y border-line">
          {content.items.map((item, index) => (
            <li key={item.title}>
              <Link to={content.cta.href} className="group grid grid-cols-[auto_1fr_auto] items-start gap-5 py-6">
                <span className="font-display text-sm text-muted">{String(index + 1).padStart(2, "0")}</span>
                <span>
                  <span className="block font-display text-2xl font-semibold text-ink transition group-hover:text-primary">{item.title}</span>
                  {item.text ? <span className="mt-2 block text-sm leading-relaxed text-muted">{item.text}</span> : null}
                </span>
                <span className="flex items-center gap-3 text-sm font-semibold text-ink">
                  {item.price ? <span>{item.price}</span> : null}
                  <ArrowUpRight className="size-5 text-muted transition group-hover:text-primary" />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>`,
    });
  },

  "process-steps": (s) => {
    const list = items(s.content, 3, filler("Paso")).slice(0, 4);
    const cols = ["", "md:grid-cols-1", "md:grid-cols-2", "md:grid-cols-3", "md:grid-cols-4"][list.length] ?? "md:grid-cols-4";
    return moduleSource({
      name: s.name,
      imports: "",
      content: { ...base(s.content), items: list },
      body: `<section id="${anchorOf(s, "proceso")}" className="bg-surface py-20 sm:py-28">
      <div className="${container}">
        ${sectionHead("center")}
        <ol className="mt-14 grid gap-6 ${cols}">
          {content.items.map((item, index) => (
            <li key={item.title} className="relative rounded-card border border-line bg-bg p-6">
              <span className="grid size-10 place-items-center rounded-full bg-primary font-display text-sm font-bold text-primary-ink">{index + 1}</span>
              <h3 className="mt-5 font-display text-lg font-semibold text-ink">{item.title}</h3>
              {item.text ? <p className="mt-2 text-sm leading-relaxed text-muted">{item.text}</p> : null}
            </li>
          ))}
        </ol>
      </div>
    </section>`,
    });
  },

  "process-timeline": (s) => {
    const list = items(s.content, 3, filler("Etapa")).slice(0, 6);
    return moduleSource({
      name: s.name,
      imports: "",
      content: { ...base(s.content), items: list },
      body: `<section id="${anchorOf(s, "proceso")}" className="py-20 sm:py-28">
      <div className="${container} grid gap-12 lg:grid-cols-2">
        ${sectionHead()}
        <ol className="relative border-l-2 border-line pl-8">
          {content.items.map((item) => (
            <li key={item.title} className="relative pb-10 last:pb-0">
              <span className="absolute -left-[41px] top-1 size-4 rounded-full border-4 border-bg bg-primary" />
              {item.meta ? <p className="text-xs font-semibold uppercase tracking-wider text-primary">{item.meta}</p> : null}
              <h3 className="mt-1 font-display text-xl font-semibold text-ink">{item.title}</h3>
              {item.text ? <p className="mt-2 text-sm leading-relaxed text-muted">{item.text}</p> : null}
            </li>
          ))}
        </ol>
      </div>
    </section>`,
    });
  },

  "stats-band": (s) => {
    const list = items(s.content, 3, (index) => ({ title: ["+5", "4.9", "24 h"][index] ?? "+1", text: "" })).slice(0, 4);
    const cols = list.length >= 4 ? "md:grid-cols-4" : "md:grid-cols-3";
    return moduleSource({
      name: s.name,
      imports: "",
      content: { title: s.content.title, items: list },
      body: `<section className="bg-primary py-16 text-primary-ink">
      <div className="${container}">
        {content.title ? <p className="text-center text-sm font-medium opacity-80">{content.title}</p> : null}
        <dl className="mt-8 grid grid-cols-2 gap-8 text-center ${cols}">
          {content.items.map((item) => (
            <div key={item.title + (item.text ?? "")}>
              <dt className="font-display text-4xl font-bold tracking-tight sm:text-5xl">{item.title}</dt>
              <dd className="mt-2 text-sm opacity-80">{item.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>`,
    });
  },
};
