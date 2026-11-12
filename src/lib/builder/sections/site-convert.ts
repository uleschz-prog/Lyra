// Menú, reservas, llamadas a la acción, contacto, blog y comparativa.
import { anchorOf, btnPrimary, card, container, cta, header, iconMap, items } from "@/lib/builder/sections/kit";
import { moduleSource, type SectionTemplate } from "@/lib/builder/sections/render";
import { base, contactCta, filler, sectionHead } from "@/lib/builder/sections/site-kit";

const input = "rounded-input border border-line bg-bg px-4 py-3 text-sm text-ink outline-none focus:border-primary";

export const convertTemplates: Record<string, SectionTemplate> = {
  "menu-board": (s) => {
    const list = items(s.content, 4, filler("Platillo")).slice(0, 16).map((item) => ({ ...item, meta: item.meta || "Menú" }));
    const groups = [...new Set(list.map((item) => item.meta))];
    return moduleSource({
      name: s.name,
      imports: header([], { react: ["useState"] }),
      content: { ...base(s.content), groups, items: list, note: s.content.note ?? "" },
      pre: "  const [group, setGroup] = useState(content.groups[0]);",
      body: `<section id="${anchorOf(s, "menu")}" className="py-20 sm:py-28">
      <div className="${container} max-w-4xl">
        ${sectionHead("center")}
        {content.groups.length > 1 ? (
          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {content.groups.map((name) => (
              <button key={name} type="button" onClick={() => setGroup(name)} className={"rounded-btn border px-4 py-2 text-sm font-semibold transition " + (group === name ? "border-primary bg-primary text-primary-ink" : "border-line bg-surface text-ink")}>{name}</button>
            ))}
          </div>
        ) : null}
        <ul className="mt-10 grid gap-x-12 gap-y-6 sm:grid-cols-2">
          {content.items.filter((item) => item.meta === group).map((item) => (
            <li key={item.title}>
              <div className="flex items-baseline gap-3">
                <span className="font-display text-lg font-semibold text-ink">{item.title}</span>
                <span className="mb-1 flex-1 border-b border-dotted border-line" />
                <span className="font-semibold text-primary">{item.price}</span>
              </div>
              {item.text ? <p className="mt-1 text-sm text-muted">{item.text}</p> : null}
            </li>
          ))}
        </ul>
        {content.note ? <p className="mt-10 text-center text-xs text-muted">{content.note}</p> : null}
      </div>
    </section>`,
    });
  },

  "booking-request": (s, ctx) => {
    const c = s.content;
    const options = (c.items ?? []).map((item) => item.title).filter(Boolean).slice(0, 12);
    return moduleSource({
      name: s.name,
      imports: header(["CalendarCheck", "CheckCircle2"], { react: ["useState", "type FormEvent"] }),
      content: { ...base(c), options: options.length ? options : ["Primera visita"], note: c.note ?? "", whatsapp: (ctx.plan.brand.whatsapp ?? "").replace(/\D/g, ""), cta: c.cta?.label ?? "Solicitar cita" },
      pre: `  const [sent, setSent] = useState<null | { name: string; service: string; date: string; time: string }>(null);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSent({ name: String(data.get("name") ?? ""), service: String(data.get("service") ?? ""), date: String(data.get("date") ?? ""), time: String(data.get("time") ?? "") });
  }
  const message = sent ? encodeURIComponent("Hola, soy " + sent.name + ". Quiero agendar " + sent.service + " el " + sent.date + " a las " + sent.time + ".") : "";`,
      body: `<section id="${anchorOf(s, "agenda")}" className="bg-surface py-20 sm:py-28">
      <div className="${container} grid gap-12 lg:grid-cols-2">
        <div>
          ${sectionHead()}
          {content.note ? <p className="mt-6 flex items-start gap-2 text-sm text-muted"><CalendarCheck className="mt-0.5 size-4 shrink-0 text-primary" />{content.note}</p> : null}
        </div>
        {sent ? (
          <div className="${card} flex flex-col items-start gap-4">
            <CheckCircle2 className="size-8 text-primary" />
            <p className="font-display text-xl font-semibold text-ink">¡Gracias, {sent.name}!</p>
            <p className="text-sm text-muted">Recibimos tu solicitud para {sent.service} el {sent.date} a las {sent.time}. Te confirmamos a la brevedad.</p>
            {content.whatsapp ? <a href={"https://wa.me/" + content.whatsapp + "?text=" + message} className="${btnPrimary}">Confirmar por WhatsApp</a> : null}
            <button type="button" onClick={() => setSent(null)} className="text-sm font-semibold text-primary">Agendar otra</button>
          </div>
        ) : (
          <form onSubmit={submit} className="${card} grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-ink sm:col-span-2">Nombre<input required name="name" className="${input}" /></label>
            <label className="grid gap-1.5 text-sm font-medium text-ink sm:col-span-2">Servicio
              <select required name="service" className="${input}">
                {content.options.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-ink">Fecha<input required type="date" name="date" className="${input}" /></label>
            <label className="grid gap-1.5 text-sm font-medium text-ink">Hora<input required type="time" name="time" className="${input}" /></label>
            <button type="submit" className="${btnPrimary} sm:col-span-2">{content.cta}</button>
          </form>
        )}
      </div>
    </section>`,
    });
  },

  "cta-banner": (s) =>
    moduleSource({
      name: s.name,
      imports: header(["ArrowRight"], { link: true }),
      content: { ...base(s.content), cta: cta(s.content.cta, contactCta), secondary: s.content.secondary ?? null },
      body: `<section className="py-16 sm:py-24">
      <div className="${container}">
        <div className="relative overflow-hidden rounded-card bg-primary px-6 py-14 text-center text-primary-ink shadow-card sm:px-16">
          <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-white/10" />
          <div className="absolute -bottom-24 -right-10 h-80 w-80 rounded-full bg-accent/30 blur-2xl" />
          <h2 className="relative mx-auto max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-5xl">{content.title}</h2>
          {content.subtitle ? <p className="relative mx-auto mt-4 max-w-xl text-base opacity-85">{content.subtitle}</p> : null}
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link to={content.cta.href} className="inline-flex items-center gap-2 rounded-btn bg-primary-ink px-6 py-3 text-sm font-semibold text-primary">{content.cta.label}<ArrowRight className="size-4" /></Link>
            {content.secondary ? <Link to={content.secondary.href} className="inline-flex items-center rounded-btn border border-primary-ink/30 px-6 py-3 text-sm font-semibold">{content.secondary.label}</Link> : null}
          </div>
        </div>
      </div>
    </section>`,
    }),

  "cta-newsletter": (s) =>
    moduleSource({
      name: s.name,
      imports: header(["Send"], { react: ["useState"] }),
      content: { ...base(s.content), cta: s.content.cta?.label ?? "Suscribirme", note: s.content.note ?? "" },
      pre: "  const [done, setDone] = useState(false);",
      body: `<section className="border-y border-line bg-surface py-16">
      <div className="${container} grid items-center gap-8 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">{content.title}</h2>
          {content.subtitle ? <p className="mt-2 text-sm text-muted">{content.subtitle}</p> : null}
        </div>
        {done ? (
          <p className="rounded-card border border-line bg-bg p-5 text-sm font-semibold text-ink">¡Listo! Te escribiremos pronto.</p>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); setDone(true); }} className="flex flex-col gap-3 sm:flex-row">
            <input required type="email" placeholder="tu@correo.com" aria-label="Correo" className="flex-1 ${input}" />
            <button type="submit" className="${btnPrimary}">{content.cta}<Send className="size-4" /></button>
          </form>
        )}
        {content.note ? <p className="text-xs text-muted lg:col-start-2">{content.note}</p> : null}
      </div>
    </section>`,
    }),

  "contact-split": (s, ctx) => {
    const b = ctx.plan.brand;
    const fields = (s.content.fields ?? []).filter(Boolean).slice(0, 6);
    return moduleSource({
      name: s.name,
      imports: header(["CheckCircle2", "Clock", "Mail", "MapPin", "Phone"], { react: ["useState"] }),
      content: {
        ...base(s.content),
        fields: fields.length ? fields : ["Nombre", "Correo o teléfono", "Mensaje"],
        phone: b.phone ?? "",
        email: b.email ?? "",
        address: b.address ?? "",
        hours: b.hours ?? "",
        whatsapp: (b.whatsapp ?? "").replace(/\D/g, ""),
        cta: s.content.cta?.label ?? "Enviar mensaje",
      },
      pre: "  const [sent, setSent] = useState(false);",
      body: `<section id="${anchorOf(s, "contacto")}" className="py-20 sm:py-28">
      <div className="${container} grid gap-12 lg:grid-cols-2">
        <div>
          ${sectionHead()}
          <ul className="mt-8 space-y-4 text-sm text-ink">
            {content.phone ? <li className="flex items-center gap-3"><Phone className="size-4 text-primary" />{content.phone}</li> : null}
            {content.email ? <li className="flex items-center gap-3"><Mail className="size-4 text-primary" />{content.email}</li> : null}
            {content.address ? <li className="flex items-center gap-3"><MapPin className="size-4 text-primary" />{content.address}</li> : null}
            {content.hours ? <li className="flex items-center gap-3"><Clock className="size-4 text-primary" />{content.hours}</li> : null}
          </ul>
          {content.whatsapp ? <a href={"https://wa.me/" + content.whatsapp} className="mt-8 ${btnPrimary}">Escríbenos por WhatsApp</a> : null}
        </div>
        {sent ? (
          <div className="${card} flex flex-col items-start gap-3">
            <CheckCircle2 className="size-8 text-primary" />
            <p className="font-display text-xl font-semibold text-ink">Mensaje recibido</p>
            <p className="text-sm text-muted">Gracias por escribirnos. Te respondemos muy pronto.</p>
          </div>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); setSent(true); }} className="${card} grid gap-4">
            {content.fields.map((field) => (
              <label key={field} className="grid gap-1.5 text-sm font-medium text-ink">
                {field}
                {/mensaje|comentario|detalle/i.test(field) ? <textarea required rows={4} className="${input}" /> : <input required className="${input}" />}
              </label>
            ))}
            <button type="submit" className="${btnPrimary}">{content.cta}</button>
          </form>
        )}
      </div>
    </section>`,
    });
  },

  "contact-cards": (s, ctx) => {
    const b = ctx.plan.brand;
    const cards = [
      b.phone ? { icon: "Phone", title: "Llámanos", text: b.phone, href: `tel:${b.phone.replace(/[^\d+]/g, "")}` } : null,
      b.whatsapp ? { icon: "MessageCircle", title: "WhatsApp", text: b.whatsapp, href: `https://wa.me/${b.whatsapp.replace(/\D/g, "")}` } : null,
      b.email ? { icon: "Mail", title: "Correo", text: b.email, href: `mailto:${b.email}` } : null,
      b.address ? { icon: "MapPin", title: "Visítanos", text: b.address, href: "" } : null,
    ].filter((entry): entry is { icon: string; title: string; text: string; href: string } => Boolean(entry));
    const list = cards.length ? cards : [{ icon: "Mail", title: "Escríbenos", text: "Te respondemos en menos de un día hábil.", href: "" }];
    const icons = [...new Set(list.map((entry) => entry.icon))].sort();
    return moduleSource({
      name: s.name,
      imports: header(icons),
      extra: iconMap(icons),
      content: { ...base(s.content), cards: list, hours: b.hours ?? "" },
      body: `<section id="${anchorOf(s, "contacto")}" className="bg-surface py-20 sm:py-28">
      <div className="${container}">
        ${sectionHead("center")}
        <div className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-2">
          {content.cards.map((entry) => {
            const Icon = icons[entry.icon as keyof typeof icons];
            const inner = (
              <>
                <span className="grid size-11 place-items-center rounded-btn bg-primary text-primary-ink"><Icon className="size-5" /></span>
                <span>
                  <span className="block font-semibold text-ink">{entry.title}</span>
                  <span className="block text-sm text-muted">{entry.text}</span>
                </span>
              </>
            );
            return entry.href ? (
              <a key={entry.title} href={entry.href} className="flex items-center gap-4 rounded-card border border-line bg-bg p-5 transition hover:border-primary">{inner}</a>
            ) : (
              <div key={entry.title} className="flex items-center gap-4 rounded-card border border-line bg-bg p-5">{inner}</div>
            );
          })}
        </div>
        {content.hours ? <p className="mt-8 text-center text-sm text-muted">{content.hours}</p> : null}
      </div>
    </section>`,
    });
  },

  "blog-cards": (s) => {
    const list = items(s.content, 3, filler("Artículo")).slice(0, 6);
    return moduleSource({
      name: s.name,
      imports: header(["ArrowRight"]),
      extra: `const covers = [
  "bg-[linear-gradient(135deg,var(--color-primary),var(--color-accent))]",
  "bg-[linear-gradient(135deg,var(--color-accent),var(--color-surface-2))]",
  "bg-[linear-gradient(135deg,var(--color-surface-2),var(--color-primary))]",
];`,
      content: { ...base(s.content), items: list },
      body: `<section id="${anchorOf(s, "blog")}" className="py-20 sm:py-28">
      <div className="${container}">
        ${sectionHead()}
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {content.items.map((post, index) => (
            <article key={post.title} className="group flex flex-col overflow-hidden rounded-card border border-line bg-surface">
              <div className={"aspect-[16/9] " + covers[index % 3]} />
              <div className="flex flex-1 flex-col p-6">
                {post.meta ? <p className="text-xs font-semibold uppercase tracking-wider text-muted">{post.meta}</p> : null}
                <h3 className="mt-2 font-display text-lg font-semibold text-ink group-hover:text-primary">{post.title}</h3>
                {post.text ? <p className="mt-2 flex-1 text-sm text-muted">{post.text}</p> : null}
                <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary">Leer más<ArrowRight className="size-4" /></span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>`,
    });
  },

  "comparison-table": (s) => {
    const list = items(s.content, 3, filler("Criterio")).slice(0, 10);
    return moduleSource({
      name: s.name,
      imports: header(["Check", "Minus"]),
      content: { ...base(s.content), items: list, us: s.content.cta?.label || "Nosotros", them: s.content.note || "Lo común" },
      body: `<section id="${anchorOf(s, "comparativa")}" className="py-20 sm:py-28">
      <div className="${container} max-w-4xl">
        ${sectionHead("center")}
        <div className="mt-12 overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-ink">
              <tr>
                <th className="p-4 font-semibold"><span className="sr-only">Criterio</span></th>
                <th className="p-4 text-center font-semibold text-primary">{content.us}</th>
                <th className="p-4 text-center font-semibold text-muted">{content.them}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {content.items.map((row) => (
                <tr key={row.title}>
                  <td className="p-4 text-ink">{row.title}{row.text ? <span className="block text-xs text-muted">{row.text}</span> : null}</td>
                  <td className="p-4 text-center"><Check className="mx-auto size-5 text-primary" /></td>
                  <td className="p-4 text-center text-muted">{row.meta ? row.meta : <Minus className="mx-auto size-5" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>`,
    });
  },
};
