// Héroes del sitio.
import { anchorOf, btnGhost, btnPrimary, card, container, cta, eyebrow, header, iconMap, iconsFor, items, lead, visualPanel, withIcons } from "@/lib/builder/sections/kit";
import { moduleSource, type SectionTemplate } from "@/lib/builder/sections/render";
import { base, contactCta, filler } from "@/lib/builder/sections/site-kit";

export const heroTemplates: Record<string, SectionTemplate> = {
  "hero-split": (s) => {
    const c = s.content;
    return moduleSource({
      name: s.name,
      imports: header(["ArrowRight", "CheckCircle2"], { link: true }),
      content: { ...base(c), cta: cta(c.cta, contactCta), secondary: c.secondary ?? null, points: (c.items ?? []).slice(0, 3).map((item) => item.title), image: c.image ?? "", note: c.note ?? "" },
      body: `<section id="${anchorOf(s, "inicio")}" className="relative overflow-hidden">
      <div className="${container} grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          {content.eyebrow ? <p className="inline-flex rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-primary">{content.eyebrow}</p> : null}
          <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-6xl">{content.title}</h1>
          <p className="${lead}">{content.subtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={content.cta.href} className="${btnPrimary}">{content.cta.label}<ArrowRight className="size-4" /></Link>
            {content.secondary ? <Link to={content.secondary.href} className="${btnGhost}">{content.secondary.label}</Link> : null}
          </div>
          {content.points.length ? (
            <ul className="mt-8 grid gap-2 sm:grid-cols-3">
              {content.points.map((point) => (
                <li key={point} className="flex items-center gap-2 text-sm text-muted"><CheckCircle2 className="size-4 shrink-0 text-primary" />{point}</li>
              ))}
            </ul>
          ) : null}
        </div>
        ${visualPanel(c.note || c.eyebrow || c.title, c.cta?.label ?? "")}
      </div>
    </section>`,
    });
  },

  "hero-centered": (s) => {
    const c = s.content;
    return moduleSource({
      name: s.name,
      imports: header(["ArrowRight", "Sparkles"], { link: true }),
      content: { ...base(c), cta: cta(c.cta, contactCta), secondary: c.secondary ?? null, note: c.note ?? "" },
      body: `<section id="${anchorOf(s, "inicio")}" className="relative isolate overflow-hidden">
      <div className="absolute inset-x-0 -top-40 -z-10 mx-auto h-[36rem] max-w-4xl rounded-full bg-[radial-gradient(closest-side,var(--color-primary),transparent)] opacity-20 blur-2xl" />
      <div className="${container} py-20 text-center sm:py-32">
        {content.eyebrow ? (
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-1.5 text-xs font-semibold text-ink shadow-card"><Sparkles className="size-3.5 text-primary" />{content.eyebrow}</p>
        ) : null}
        <h1 className="mx-auto mt-6 max-w-4xl font-display text-4xl font-extrabold leading-[1.02] tracking-tight text-ink sm:text-7xl">{content.title}</h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted">{content.subtitle}</p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link to={content.cta.href} className="${btnPrimary}">{content.cta.label}<ArrowRight className="size-4" /></Link>
          {content.secondary ? <Link to={content.secondary.href} className="${btnGhost}">{content.secondary.label}</Link> : null}
        </div>
        {content.note ? <p className="mt-6 text-xs text-muted">{content.note}</p> : null}
      </div>
    </section>`,
    });
  },

  "hero-editorial": (s) => {
    const c = s.content;
    return moduleSource({
      name: s.name,
      imports: header(["ArrowRight"], { link: true }),
      content: { ...base(c), cta: cta(c.cta, contactCta), note: c.note ?? "" },
      body: `<section id="${anchorOf(s, "inicio")}" className="border-b border-line">
      <div className="${container} grid gap-10 py-16 sm:py-24 lg:grid-cols-12">
        <div className="lg:col-span-8">
          {content.eyebrow ? <p className="text-xs uppercase tracking-[0.3em] text-muted">{content.eyebrow}</p> : null}
          <h1 className="mt-6 font-display text-5xl font-semibold leading-[0.95] tracking-tight text-ink sm:text-7xl lg:text-8xl">{content.title}</h1>
        </div>
        <div className="flex flex-col justify-end gap-6 border-t border-line pt-6 lg:col-span-4 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <p className="text-base leading-relaxed text-muted">{content.subtitle}</p>
          <Link to={content.cta.href} className="group inline-flex items-center gap-3 text-sm font-semibold text-ink">
            <span className="border-b-2 border-primary pb-1">{content.cta.label}</span>
            <ArrowRight className="size-4 transition group-hover:translate-x-1" />
          </Link>
          {content.note ? <p className="text-xs italic text-muted">{content.note}</p> : null}
        </div>
      </div>
    </section>`,
    });
  },

  "hero-bento": (s) => {
    const c = s.content;
    const list = withIcons(items(c, 2, filler("Ventaja")).slice(0, 2), "Sparkles");
    const icons = iconsFor(list, "Sparkles");
    return moduleSource({
      name: s.name,
      imports: header([...icons, "ArrowRight"], { link: true }),
      extra: iconMap(icons),
      content: { ...base(c), cta: cta(c.cta, contactCta), items: list },
      body: `<section id="${anchorOf(s, "inicio")}" className="${container} py-10 sm:py-16">
      <div className="grid gap-4 lg:grid-cols-3 lg:grid-rows-2">
        <div className="relative overflow-hidden rounded-card bg-primary p-8 text-primary-ink shadow-card sm:p-12 lg:col-span-2 lg:row-span-2">
          <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10" />
          {content.eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">{content.eyebrow}</p> : null}
          <h1 className="mt-6 max-w-2xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-6xl">{content.title}</h1>
          <p className="mt-5 max-w-xl text-base opacity-85 sm:text-lg">{content.subtitle}</p>
          <Link to={content.cta.href} className="mt-10 inline-flex items-center gap-2 rounded-btn bg-primary-ink px-6 py-3 text-sm font-semibold text-primary">{content.cta.label}<ArrowRight className="size-4" /></Link>
        </div>
        {content.items.map((item) => {
          const Icon = icons[item.icon as keyof typeof icons] ?? Sparkles;
          return (
            <div key={item.title} className="${card} flex flex-col justify-between">
              <span className="grid size-11 place-items-center rounded-btn bg-surface-2 text-primary"><Icon className="size-5" /></span>
              <div className="mt-8">
                <p className="font-display text-xl font-semibold text-ink">{item.title}</p>
                {item.text ? <p className="mt-2 text-sm text-muted">{item.text}</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>`,
    });
  },

  "hero-stats": (s) => {
    const c = s.content;
    const list = items(c, 3, (index) => ({ title: ["24/7", "+10", "100%"][index] ?? "+1", text: "" })).slice(0, 4);
    return moduleSource({
      name: s.name,
      imports: header(["ArrowRight"], { link: true }),
      content: { ...base(c), cta: cta(c.cta, contactCta), secondary: c.secondary ?? null, stats: list },
      body: `<section id="${anchorOf(s, "inicio")}" className="relative overflow-hidden bg-surface">
      <div className="${container} py-20 sm:py-28">
        <div className="max-w-3xl">
          {content.eyebrow ? <p className="${eyebrow}">{content.eyebrow}</p> : null}
          <h1 className="mt-4 font-display text-5xl font-bold uppercase leading-[0.95] tracking-tight text-ink sm:text-7xl">{content.title}</h1>
          <p className="${lead}">{content.subtitle}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to={content.cta.href} className="${btnPrimary}">{content.cta.label}<ArrowRight className="size-4" /></Link>
            {content.secondary ? <Link to={content.secondary.href} className="${btnGhost}">{content.secondary.label}</Link> : null}
          </div>
        </div>
        <dl className="mt-16 grid ${list.length === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4"} gap-px overflow-hidden rounded-card border border-line bg-line">
          {content.stats.map((stat) => (
            <div key={stat.title + (stat.text ?? "")} className="bg-bg p-6">
              <dt className="font-display text-3xl font-bold text-primary sm:text-4xl">{stat.title}</dt>
              <dd className="mt-1 text-sm text-muted">{stat.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>`,
    });
  },

  "hero-offer": (s, ctx) => {
    const c = s.content;
    return moduleSource({
      name: s.name,
      imports: header(["Clock", "MapPin", "Phone"], { link: true }),
      content: { ...base(c), cta: cta(c.cta, contactCta), secondary: c.secondary ?? null, note: c.note ?? "", hours: ctx.plan.brand.hours ?? "", address: ctx.plan.brand.address ?? "", phone: ctx.plan.brand.phone ?? "", image: c.image ?? "" },
      body: `<section id="${anchorOf(s, "inicio")}" className="relative">
      <div className="${container} grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-2">
        <div className="order-2 lg:order-1">
          {content.eyebrow ? <p className="inline-flex rounded-btn bg-accent px-3 py-1 text-xs font-bold text-accent-ink">{content.eyebrow}</p> : null}
          <h1 className="mt-5 font-display text-4xl font-extrabold leading-tight tracking-tight text-ink sm:text-6xl">{content.title}</h1>
          <p className="${lead}">{content.subtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={content.cta.href} className="${btnPrimary}">{content.cta.label}</Link>
            {content.secondary ? <Link to={content.secondary.href} className="${btnGhost}">{content.secondary.label}</Link> : null}
          </div>
          <ul className="mt-8 grid gap-3 text-sm text-muted sm:grid-cols-3">
            {content.hours ? <li className="flex items-center gap-2"><Clock className="size-4 shrink-0 text-primary" />{content.hours}</li> : null}
            {content.address ? <li className="flex items-center gap-2"><MapPin className="size-4 shrink-0 text-primary" />{content.address}</li> : null}
            {content.phone ? <li className="flex items-center gap-2"><Phone className="size-4 shrink-0 text-primary" />{content.phone}</li> : null}
          </ul>
        </div>
        <div className="order-1 lg:order-2">
          ${visualPanel(c.note || c.title, c.eyebrow ?? "")}
        </div>
      </div>
    </section>`,
    });
  },

  "logos-strip": (s) => {
    const list = items(s.content, 4, filler("Cliente")).slice(0, 6);
    return moduleSource({
      name: s.name,
      imports: "",
      content: { title: s.content.title, items: list.map((item) => item.title) },
      body: `<section className="border-y border-line bg-surface">
      <div className="${container} flex flex-col items-center gap-6 py-10 sm:flex-row sm:justify-between">
        <p className="text-sm text-muted">{content.title}</p>
        <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {content.items.map((name) => (
            <li key={name} className="font-display text-lg font-semibold tracking-tight text-ink/60">{name}</li>
          ))}
        </ul>
      </div>
    </section>`,
    });
  },
};
