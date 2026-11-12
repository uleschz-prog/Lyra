// Pantallas de app (parte 1): marcos, tablero, tabla y formulario. Usan la capa de datos local
// (src/lib/data.ts) detrás de una interfaz que el PR E cambiará por la Data API.
import { btnGhost, btnPrimary, card, header, iconMap } from "@/lib/builder/sections/kit";
import { moduleSource, type SectionTemplate } from "@/lib/builder/sections/render";
import { iconOr } from "@/lib/builder/icons";

const input = "w-full rounded-input border border-line bg-bg px-3 py-2.5 text-sm text-ink outline-none focus:border-primary";

function entityKey(s: Parameters<SectionTemplate>[0], ctx: Parameters<SectionTemplate>[1]) {
  const wanted = s.content.entity;
  return ctx.plan.entities.find((entity) => entity.key === wanted)?.key ?? ctx.plan.entities[0]?.key ?? "registros";
}

function pageLinks(ctx: Parameters<SectionTemplate>[1]) {
  return ctx.plan.pages
    .filter((page) => !/\/nuev[oa]$/.test(page.path))
    .slice(0, 8)
    .map((page, index) => {
      const entity = ctx.plan.entities.find((item) => page.path.includes(item.key));
      return { label: page.title, href: page.path, icon: iconOr(entity?.icon, index === 0 ? "LayoutDashboard" : "Layers") };
    });
}

export { entityKey, input };

export const appTemplatesA: Record<string, SectionTemplate> = {
  "app-shell-sidebar": (s, ctx) => {
    const links = pageLinks(ctx);
    const icons = [...new Set([...links.map((link) => link.icon), "Layers"])].sort();
    return moduleSource({
      name: s.name,
      imports: `import type { ReactNode } from "react";\nimport { useState } from "react";\n${header([...icons, "Menu", "X"], { link: true })}\nimport { useRoute } from "../lib/router";`,
      extra: iconMap(icons),
      content: { brand: ctx.plan.brand.name, tagline: ctx.plan.brand.tagline, links },
      pre: "  const route = useRoute();\n  const [open, setOpen] = useState(false);",
      body: `<div className="min-h-screen bg-bg text-ink lg:grid lg:grid-cols-[260px_1fr]">
      <aside className={(open ? "fixed inset-0 z-40 block" : "hidden") + " bg-surface lg:static lg:block lg:border-r lg:border-line"}>
        <div className="flex h-16 items-center justify-between px-5">
          <p className="font-display text-lg font-bold">{content.brand}</p>
          <button type="button" onClick={() => setOpen(false)} className="rounded-btn p-2 lg:hidden" aria-label="Cerrar menú"><X className="size-5" /></button>
        </div>
        <nav className="grid gap-1 px-3 py-2">
          {content.links.map((link) => {
            const Icon = icons[link.icon as keyof typeof icons] ?? Layers;
            const active = route.path === link.href || (link.href !== "/" && route.path.startsWith(link.href));
            return (
              <Link key={link.href} to={link.href} onNavigate={() => setOpen(false)} className={"flex items-center gap-3 rounded-btn px-3 py-2.5 text-sm font-medium transition " + (active ? "bg-primary text-primary-ink" : "text-muted hover:bg-surface-2 hover:text-ink")}>
                <Icon className="size-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>
        <p className="mt-auto px-6 py-6 text-xs text-muted">{content.tagline}</p>
      </aside>
      <div className="min-w-0">
        <header className="flex h-16 items-center justify-between border-b border-line bg-surface px-5 lg:hidden">
          <p className="font-display font-bold">{content.brand}</p>
          <button type="button" onClick={() => setOpen(true)} className="rounded-btn border border-line p-2" aria-label="Abrir menú"><Menu className="size-5" /></button>
        </header>
        <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">{children}</main>
      </div>
    </div>`,
    }).replace(`export default function ${s.name}() {`, `export default function ${s.name}({ children }: { children: ReactNode }) {`);
  },

  "app-shell-topbar": (s, ctx) => {
    const links = pageLinks(ctx);
    return moduleSource({
      name: s.name,
      imports: `import type { ReactNode } from "react";\nimport { Link, useRoute } from "../lib/router";`,
      content: { brand: ctx.plan.brand.name, links },
      pre: "  const route = useRoute();",
      body: `<div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8">
          <p className="shrink-0 font-display text-lg font-bold">{content.brand}</p>
          <nav className="flex gap-1 overflow-x-auto">
            {content.links.map((link) => {
              const active = route.path === link.href || (link.href !== "/" && route.path.startsWith(link.href));
              return (
                <Link key={link.href} to={link.href} className={"whitespace-nowrap rounded-btn px-3 py-2 text-sm font-medium " + (active ? "bg-surface-2 text-ink" : "text-muted hover:text-ink")}>{link.label}</Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">{children}</main>
    </div>`,
    }).replace(`export default function ${s.name}() {`, `export default function ${s.name}({ children }: { children: ReactNode }) {`);
  },

  "app-dashboard": (s, ctx) => {
    const keys = ctx.plan.entities.map((entity) => entity.key).slice(0, 4);
    const main = entityKey(s, ctx);
    return moduleSource({
      name: s.name,
      imports: `${header(["ArrowUpRight", "TrendingUp"], { link: true, data: true })}\nimport { formatValue, primaryField } from "../lib/format";`,
      content: { title: s.content.title, subtitle: s.content.subtitle ?? "", keys, main, cta: s.content.cta ?? null },
      pre: `  const lists = content.keys.map((key) => ({ key, rows: useCollection(stores[key]) }));
  const mainRows = lists.find((entry) => entry.key === content.main)?.rows ?? [];
  const mainSchema = schema[content.main];
  const money = mainSchema.fields.find((field) => field.type === "money");
  const total = money ? mainRows.reduce((sum, row) => sum + (Number(row[money.key]) || 0), 0) : null;
  const label = primaryField(mainSchema);
  const recent = [...mainRows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const group = mainSchema.fields.find((field) => field.type === "select");
  const groups = group
    ? (group.options ?? []).map((option) => {
        const rows = mainRows.filter((row) => row[group.key] === option);
        return { option, count: rows.length, amount: money ? rows.reduce((sum, row) => sum + (Number(row[money.key]) || 0), 0) : 0 };
      })
    : [];
  const peak = Math.max(1, ...groups.map((entry) => (money ? entry.amount : entry.count)));`,
      body: `<div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{content.title}</h1>
          {content.subtitle ? <p className="mt-1 text-sm text-muted">{content.subtitle}</p> : null}
        </div>
        {content.cta ? <Link to={content.cta.href} className="${btnPrimary}">{content.cta.label}</Link> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {lists.map((entry) => (
          <div key={entry.key} className="${card}">
            <p className="text-sm text-muted">{schema[entry.key].label}</p>
            <p className="mt-2 font-display text-3xl font-bold">{entry.rows.length}</p>
          </div>
        ))}
        {money && total !== null ? (
          <div className="rounded-card bg-primary p-6 text-primary-ink shadow-card">
            <p className="flex items-center gap-2 text-sm opacity-80"><TrendingUp className="size-4" />{money.label}</p>
            <p className="mt-2 font-display text-3xl font-bold">{formatValue(money, total)}</p>
          </div>
        ) : null}
        {money && mainRows.length ? (
          <div className="${card}">
            <p className="text-sm text-muted">Promedio</p>
            <p className="mt-2 font-display text-3xl font-bold">{formatValue(money, (total ?? 0) / mainRows.length)}</p>
          </div>
        ) : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {group ? (
          <div className="${card}">
            <p className="font-display text-lg font-semibold">Por {group.label.toLowerCase()}</p>
            <ul className="mt-5 space-y-4">
              {groups.map((entry) => (
                <li key={entry.option}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{entry.option}</span>
                    <span className="text-muted">{money ? formatValue(money, entry.amount) : entry.count}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-surface-2">
                    <div className="h-2 rounded-full bg-primary" style={{ width: \`\${Math.round(((money ? entry.amount : entry.count) / peak) * 100)}%\` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className={\`${card} \${group ? "lg:col-span-2" : "lg:col-span-3"}\`}>
          <p className="font-display text-lg font-semibold">Recientes · {mainSchema.label}</p>
          {recent.length ? (
            <ul className="mt-4 divide-y divide-line">
              {recent.map((row: Row) => (
                <li key={row.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <span className="font-medium">{String(row[label.key] ?? "")}</span>
                  <span className="flex items-center gap-3 text-muted">
                    {group && row[group.key] ? <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-ink">{String(row[group.key])}</span> : null}
                    {money ? formatValue(money, row[money.key]) : new Date(row.createdAt).toLocaleDateString("es-MX")}
                    <ArrowUpRight className="size-3.5" />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted">Aún no hay registros.</p>
          )}
        </div>
      </div>
    </div>`,
    });
  },

  "app-table": (s, ctx) =>
    moduleSource({
      name: s.name,
      imports: `${header(["Plus", "Search", "Trash2"], { link: true, data: true, react: ["useMemo", "useState"] })}\nimport { formatValue } from "../lib/format";`,
      content: { title: s.content.title, subtitle: s.content.subtitle ?? "", entity: entityKey(s, ctx), cta: s.content.cta ?? null },
      pre: `  const entity = schema[content.entity];
  const store = stores[content.entity];
  const rows = useCollection(store);
  const [query, setQuery] = useState("");
  const filterField = entity.fields.find((field) => field.type === "select");
  const [filter, setFilter] = useState("");
  const columns = entity.fields.slice(0, 4);
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return rows.filter((row: Row) => {
      if (filterField && filter && row[filterField.key] !== filter) return false;
      if (!text) return true;
      return entity.fields.some((field) => String(row[field.key] ?? "").toLowerCase().includes(text));
    });
  }, [rows, query, filter, filterField, entity.fields]);`,
      body: `<div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{content.title}</h1>
          {content.subtitle ? <p className="mt-1 text-sm text-muted">{content.subtitle}</p> : null}
        </div>
        {content.cta ? <Link to={content.cta.href} className="${btnPrimary}"><Plus className="size-4" />{content.cta.label}</Link> : null}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={"Buscar en " + entity.label.toLowerCase()} className="${input} pl-9" />
        </label>
        {filterField ? (
          <select value={filter} onChange={(event) => setFilter(event.target.value)} className="${input} sm:w-56" aria-label={filterField.label}>
            <option value="">Todos</option>
            {(filterField.options ?? []).map((option) => <option key={option}>{option}</option>)}
          </select>
        ) : null}
      </div>
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        {visible.length ? (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface-2 text-xs uppercase tracking-wider text-muted">
              <tr>
                {columns.map((field) => <th key={field.key} className="px-4 py-3 font-semibold">{field.label}</th>)}
                <th className="px-4 py-3"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((row: Row) => (
                <tr key={row.id} className="hover:bg-surface-2/50">
                  {columns.map((field) => <td key={field.key} className="px-4 py-3">{formatValue(field, row[field.key])}</td>)}
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => { if (window.confirm("¿Eliminar este registro?")) store.remove(row.id); }} className="rounded-btn p-2 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Eliminar"><Trash2 className="size-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-10 text-center">
            <p className="font-semibold">{rows.length ? "Sin resultados" : "Todavía no hay " + entity.label.toLowerCase()}</p>
            <p className="mt-1 text-sm text-muted">{rows.length ? "Prueba con otra búsqueda." : "Agrega el primero para empezar."}</p>
          </div>
        )}
      </div>
      <p className="text-xs text-muted">{visible.length} de {rows.length} registros</p>
    </div>`,
    }),

  "app-form": (s, ctx) =>
    moduleSource({
      name: s.name,
      imports: `${header(["CheckCircle2"], { link: true, data: true, react: ["useState", "type FormEvent"] })}\nimport { inputType } from "../lib/format";`,
      content: { title: s.content.title, subtitle: s.content.subtitle ?? "", entity: entityKey(s, ctx), cta: s.content.cta ?? null, submit: s.content.note || "Guardar" },
      pre: `  const entity = schema[content.entity];
  const store = stores[content.entity];
  const [saved, setSaved] = useState<Row | null>(null);
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values: Record<string, unknown> = {};
    for (const field of entity.fields) {
      const raw = data.get(field.key);
      if (field.type === "boolean") values[field.key] = raw === "on";
      else if (field.type === "number" || field.type === "money") values[field.key] = raw === "" || raw === null ? null : Number(raw);
      else values[field.key] = String(raw ?? "").trim();
      if (field.required && (values[field.key] === "" || values[field.key] === null)) {
        setError("Completa: " + field.label);
        return;
      }
    }
    setError("");
    setSaved(store.create(values));
    event.currentTarget.reset();
  }`,
      body: `<div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{content.title}</h1>
        {content.subtitle ? <p className="mt-1 text-sm text-muted">{content.subtitle}</p> : null}
      </div>
      {saved ? (
        <div className="flex items-start gap-3 rounded-card border border-line bg-surface-2 p-4 text-sm">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <p className="font-semibold">{entity.singular} guardado.</p>
            {content.cta ? <Link to={content.cta.href} className="mt-1 inline-block font-semibold text-primary">{content.cta.label}</Link> : null}
          </div>
        </div>
      ) : null}
      <form onSubmit={submit} className="${card} grid gap-4 sm:grid-cols-2" noValidate>
        {entity.fields.map((field) => (
          <label key={field.key} className={"grid gap-1.5 text-sm font-medium " + (field.type === "longtext" ? "sm:col-span-2" : "")}>
            <span>{field.label}{field.required ? <span className="text-primary"> *</span> : null}</span>
            {field.type === "select" ? (
              <select name={field.key} className="${input}" defaultValue="">
                <option value="" disabled>Elige una opción</option>
                {(field.options ?? []).map((option) => <option key={option}>{option}</option>)}
              </select>
            ) : field.type === "longtext" ? (
              <textarea name={field.key} rows={4} className="${input}" />
            ) : field.type === "boolean" ? (
              <input type="checkbox" name={field.key} className="size-5 accent-[var(--color-primary)]" />
            ) : (
              <input name={field.key} type={inputType(field)} step={field.type === "money" ? "0.01" : undefined} className="${input}" />
            )}
          </label>
        ))}
        {error ? <p className="text-sm font-medium text-primary sm:col-span-2">{error}</p> : null}
        <div className="flex gap-3 sm:col-span-2">
          <button type="submit" className="${btnPrimary}">{content.submit}</button>
          {content.cta ? <Link to={content.cta.href} className="${btnGhost}">Cancelar</Link> : null}
        </div>
      </form>
    </div>`,
    }),
};
