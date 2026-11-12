// Navegación y pies de página de sitio.
import { container, cta, header } from "@/lib/builder/sections/kit";
import { moduleSource, type SectionTemplate } from "@/lib/builder/sections/render";
import { contactCta, navLinks } from "@/lib/builder/sections/site-kit";

const menuButton = `{open ? <X className="size-5" /> : <Menu className="size-5" />}`;

export const navTemplates: Record<string, SectionTemplate> = {
  "nav-minimal": (s, ctx) =>
    moduleSource({
      name: s.name,
      imports: header(["Menu", "X"], { link: true, react: ["useState"] }),
      content: { brand: ctx.plan.brand.name, links: navLinks(ctx), cta: cta(s.content.cta, contactCta) },
      pre: "  const [open, setOpen] = useState(false);",
      body: `<header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="${container} flex h-16 items-center justify-between gap-6">
        <Link to="/" className="font-display text-lg font-bold tracking-tight text-ink">{content.brand}</Link>
        <nav className="hidden items-center gap-7 md:flex">
          {content.links.map((link) => (
            <Link key={link.href} to={link.href} className="text-sm font-medium text-muted transition hover:text-ink">{link.label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link to={content.cta.href} className="hidden rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-ink sm:inline-flex">{content.cta.label}</Link>
          <button type="button" onClick={() => setOpen(!open)} className="inline-flex rounded-btn border border-line p-2 text-ink md:hidden" aria-label="Abrir menú">
            ${menuButton}
          </button>
        </div>
      </div>
      {open ? (
        <nav className="border-t border-line bg-bg md:hidden">
          <div className="${container} flex flex-col py-3">
            {content.links.map((link) => (
              <Link key={link.href} to={link.href} onNavigate={() => setOpen(false)} className="py-2 text-sm font-medium text-ink">{link.label}</Link>
            ))}
          </div>
        </nav>
      ) : null}
    </header>`,
    }),

  "nav-centered": (s, ctx) =>
    moduleSource({
      name: s.name,
      imports: header(["Menu", "X"], { link: true, react: ["useState"] }),
      content: { brand: ctx.plan.brand.name, tagline: ctx.plan.brand.tagline, links: navLinks(ctx), cta: cta(s.content.cta, contactCta) },
      pre: "  const [open, setOpen] = useState(false);",
      body: `<header className="relative z-40 border-b border-line bg-bg">
      <div className="${container} flex flex-col items-center gap-3 py-5">
        <Link to="/" className="font-display text-2xl font-semibold tracking-tight text-ink">{content.brand}</Link>
        <p className="hidden text-[11px] uppercase tracking-[0.3em] text-muted sm:block">{content.tagline}</p>
        <nav className="hidden items-center gap-8 pt-2 md:flex">
          {content.links.map((link) => (
            <Link key={link.href} to={link.href} className="text-sm text-ink/80 transition hover:text-primary">{link.label}</Link>
          ))}
          <Link to={content.cta.href} className="text-sm font-semibold text-primary underline decoration-2 underline-offset-8">{content.cta.label}</Link>
        </nav>
        <button type="button" onClick={() => setOpen(!open)} className="absolute right-5 top-5 rounded-btn border border-line p-2 md:hidden" aria-label="Abrir menú">
          ${menuButton}
        </button>
        {open ? (
          <nav className="flex w-full flex-col items-center gap-1 pb-2 md:hidden">
            {content.links.map((link) => (
              <Link key={link.href} to={link.href} onNavigate={() => setOpen(false)} className="py-2 text-sm text-ink">{link.label}</Link>
            ))}
          </nav>
        ) : null}
      </div>
    </header>`,
    }),

  "nav-pill": (s, ctx) =>
    moduleSource({
      name: s.name,
      imports: header(["ArrowUpRight", "Menu", "X"], { link: true, react: ["useState"] }),
      content: { brand: ctx.plan.brand.name, links: navLinks(ctx), cta: cta(s.content.cta, contactCta) },
      pre: "  const [open, setOpen] = useState(false);",
      body: `<header className="sticky top-3 z-40 px-3">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 rounded-full border border-line bg-surface/80 px-4 py-2 shadow-card backdrop-blur">
        <Link to="/" className="flex items-center gap-2 font-display text-base font-bold text-ink">
          <span className="grid size-8 place-items-center rounded-full bg-primary text-sm text-primary-ink">{content.brand.slice(0, 1)}</span>
          {content.brand}
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {content.links.map((link) => (
            <Link key={link.href} to={link.href} className="rounded-full px-3 py-1.5 text-sm text-muted transition hover:bg-surface-2 hover:text-ink">{link.label}</Link>
          ))}
        </nav>
        <Link to={content.cta.href} className="hidden items-center gap-1 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-bg sm:inline-flex">
          {content.cta.label}
          <ArrowUpRight className="size-4" />
        </Link>
        <button type="button" onClick={() => setOpen(!open)} className="rounded-full p-2 md:hidden" aria-label="Abrir menú">
          ${menuButton}
        </button>
      </div>
      {open ? (
        <nav className="mx-auto mt-2 flex max-w-5xl flex-col rounded-card border border-line bg-surface p-3 shadow-card md:hidden">
          {content.links.map((link) => (
            <Link key={link.href} to={link.href} onNavigate={() => setOpen(false)} className="rounded-btn px-3 py-2 text-sm text-ink hover:bg-surface-2">{link.label}</Link>
          ))}
        </nav>
      ) : null}
    </header>`,
    }),

  "footer-columns": (s, ctx) => {
    const b = ctx.plan.brand;
    return moduleSource({
      name: s.name,
      imports: header([], { link: true }),
      content: {
        brand: b.name,
        tagline: b.tagline,
        links: navLinks(ctx),
        contact: [b.phone, b.email, b.address, b.hours].filter(Boolean),
        note: s.content.note ?? "",
      },
      body: `<footer className="border-t border-line bg-surface">
      <div className="${container} grid gap-10 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="font-display text-xl font-bold text-ink">{content.brand}</p>
          <p className="mt-3 max-w-sm text-sm text-muted">{content.tagline}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Navegación</p>
          <ul className="mt-4 space-y-2 text-sm">
            {content.links.map((link) => <li key={link.href}><Link to={link.href} className="text-ink hover:text-primary">{link.label}</Link></li>)}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Contacto</p>
          <ul className="mt-4 space-y-2 text-sm text-ink">
            {content.contact.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="${container} flex flex-col justify-between gap-2 py-6 text-xs text-muted sm:flex-row">
          <p>© {new Date().getFullYear()} {content.brand}. Todos los derechos reservados.</p>
          {content.note ? <p>{content.note}</p> : null}
        </div>
      </div>
    </footer>`,
    });
  },

  "footer-minimal": (s, ctx) =>
    moduleSource({
      name: s.name,
      imports: header([], { link: true }),
      content: { brand: ctx.plan.brand.name, links: navLinks(ctx), note: s.content.note || ctx.plan.brand.tagline },
      body: `<footer className="border-t border-line">
      <div className="${container} flex flex-col items-center justify-between gap-4 py-10 text-sm sm:flex-row">
        <p className="font-display font-semibold text-ink">{content.brand}</p>
        <nav className="flex flex-wrap justify-center gap-5">
          {content.links.map((link) => <Link key={link.href} to={link.href} className="text-muted hover:text-ink">{link.label}</Link>)}
        </nav>
        <p className="text-xs text-muted">© {new Date().getFullYear()} · {content.note}</p>
      </div>
    </footer>`,
    }),
};
