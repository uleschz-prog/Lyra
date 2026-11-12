// Pantallas de app (parte 2): kanban, agenda, maestro-detalle, ajustes, gráfica, actividad,
// punto de venta y bienvenida.
import { btnPrimary, card, header, iconMap, iconsFor, items, withIcons } from "@/lib/builder/sections/kit";
import { entityKey, input } from "@/lib/builder/sections/app-a";
import { moduleSource, type SectionTemplate } from "@/lib/builder/sections/render";

function selectFieldOf(s: Parameters<SectionTemplate>[0], ctx: Parameters<SectionTemplate>[1]) {
  const entity = ctx.plan.entities.find((item) => item.key === entityKey(s, ctx));
  return entity?.fields.find((field) => field.type === "select")?.key ?? "";
}

export const appTemplatesB: Record<string, SectionTemplate> = {
  "app-kanban": (s, ctx) =>
    moduleSource({
      name: s.name,
      imports: `${header(["ChevronRight"], { data: true })}\nimport { primaryField } from "../lib/format";`,
      content: { title: s.content.title, subtitle: s.content.subtitle ?? "", entity: entityKey(s, ctx), field: selectFieldOf(s, ctx) },
      pre: `  const entity = schema[content.entity];
  const store = stores[content.entity];
  const rows = useCollection(store);
  const group = entity.fields.find((field) => field.key === content.field) ?? entity.fields.find((field) => field.type === "select");
  const columns = group?.options?.length ? group.options : ["Pendiente", "En curso", "Listo"];
  const label = primaryField(entity);
  function move(row: Row, step: number) {
    if (!group) return;
    const index = columns.indexOf(String(row[group.key] ?? columns[0]));
    const next = columns[Math.min(columns.length - 1, Math.max(0, index + step))];
    store.update(row.id, { [group.key]: next });
  }`,
      body: `<div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{content.title}</h1>
        {content.subtitle ? <p className="mt-1 text-sm text-muted">{content.subtitle}</p> : null}
      </div>
      <div className="grid gap-4 md:grid-flow-col md:auto-cols-fr">
        {columns.map((column) => {
          const cards = rows.filter((row: Row) => String(row[group?.key ?? ""] ?? columns[0]) === column);
          return (
            <section key={column} className="rounded-card border border-line bg-surface-2/60 p-3">
              <p className="flex items-center justify-between px-1 pb-3 text-sm font-semibold">{column}<span className="rounded-full bg-surface px-2 text-xs text-muted">{cards.length}</span></p>
              <div className="grid gap-2">
                {cards.map((row: Row) => (
                  <article key={row.id} className="rounded-btn border border-line bg-surface p-3 text-sm shadow-card">
                    <p className="font-medium">{String(row[label.key] ?? "")}</p>
                    <div className="mt-3 flex justify-between">
                      <button type="button" onClick={() => move(row, -1)} className="text-xs text-muted hover:text-ink" disabled={column === columns[0]}>Atrás</button>
                      <button type="button" onClick={() => move(row, 1)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary" disabled={column === columns[columns.length - 1]}>Avanzar<ChevronRight className="size-3.5" /></button>
                    </div>
                  </article>
                ))}
                {cards.length ? null : <p className="px-1 py-4 text-center text-xs text-muted">Sin elementos</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>`,
    }),

  "app-agenda": (s, ctx) =>
    moduleSource({
      name: s.name,
      imports: `${header(["CalendarDays", "Clock", "Plus"], { data: true, react: ["useState", "type FormEvent"] })}\nimport { primaryField } from "../lib/format";`,
      content: { title: s.content.title, subtitle: s.content.subtitle ?? "", entity: entityKey(s, ctx) },
      pre: `  const entity = schema[content.entity];
  const store = stores[content.entity];
  const rows = useCollection(store);
  const label = primaryField(entity);
  const dateField = entity.fields.find((field) => field.type === "date");
  const timeField = entity.fields.find((field) => field.type === "time");
  const [adding, setAdding] = useState(false);
  const sorted = [...rows].sort((a: Row, b: Row) => String(a[dateField?.key ?? "createdAt"] ?? "").localeCompare(String(b[dateField?.key ?? "createdAt"] ?? "")) || String(a[timeField?.key ?? ""] ?? "").localeCompare(String(b[timeField?.key ?? ""] ?? "")));
  const days = [...new Set(sorted.map((row: Row) => String(row[dateField?.key ?? "createdAt"] ?? "").slice(0, 10)))];
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values: Record<string, unknown> = { [label.key]: String(data.get("label") ?? "") };
    if (dateField) values[dateField.key] = String(data.get("date") ?? "");
    if (timeField) values[timeField.key] = String(data.get("time") ?? "");
    store.create(values);
    setAdding(false);
  }`,
      body: `<div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{content.title}</h1>
          {content.subtitle ? <p className="mt-1 text-sm text-muted">{content.subtitle}</p> : null}
        </div>
        <button type="button" onClick={() => setAdding(!adding)} className="${btnPrimary}"><Plus className="size-4" />Agregar</button>
      </div>
      {adding ? (
        <form onSubmit={add} className="${card} grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <input required name="label" placeholder={label.label} className="${input}" />
          {dateField ? <input required type="date" name="date" className="${input}" /> : null}
          {timeField ? <input type="time" name="time" className="${input}" /> : null}
          <button type="submit" className="${btnPrimary}">Guardar</button>
        </form>
      ) : null}
      {days.length ? (
        <div className="space-y-6">
          {days.map((day) => (
            <section key={day}>
              <p className="flex items-center gap-2 text-sm font-semibold text-muted"><CalendarDays className="size-4 text-primary" />{day ? new Date(day + "T12:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" }) : "Sin fecha"}</p>
              <ul className="mt-3 grid gap-2">
                {sorted.filter((row: Row) => String(row[dateField?.key ?? "createdAt"] ?? "").slice(0, 10) === day).map((row: Row) => (
                  <li key={row.id} className="flex items-center justify-between gap-4 rounded-card border border-line bg-surface px-4 py-3 text-sm">
                    <span className="font-medium">{String(row[label.key] ?? "")}</span>
                    {timeField && row[timeField.key] ? <span className="inline-flex items-center gap-1 text-muted"><Clock className="size-3.5" />{String(row[timeField.key])}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <p className="rounded-card border border-dashed border-line p-10 text-center text-sm text-muted">No hay nada agendado todavía.</p>
      )}
    </div>`,
    }),

  "app-master-detail": (s, ctx) =>
    moduleSource({
      name: s.name,
      imports: `${header(["Pencil"], { data: true, react: ["useState"] })}\nimport { formatValue, inputType, primaryField } from "../lib/format";`,
      content: { title: s.content.title, subtitle: s.content.subtitle ?? "", entity: entityKey(s, ctx) },
      pre: `  const entity = schema[content.entity];
  const store = stores[content.entity];
  const rows = useCollection(store);
  const label = primaryField(entity);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const selected = rows.find((row: Row) => row.id === selectedId) ?? rows[0];`,
      body: `<div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{content.title}</h1>
        {content.subtitle ? <p className="mt-1 text-sm text-muted">{content.subtitle}</p> : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto rounded-card border border-line bg-surface">
          {rows.map((row: Row) => (
            <li key={row.id}>
              <button type="button" onClick={() => { setSelectedId(row.id); setEditing(false); }} className={"w-full px-4 py-3 text-left text-sm " + (selected?.id === row.id ? "bg-surface-2 font-semibold" : "hover:bg-surface-2/60")}>{String(row[label.key] ?? "Sin nombre")}</button>
            </li>
          ))}
          {rows.length ? null : <li className="p-6 text-center text-sm text-muted">Sin registros</li>}
        </ul>
        {selected ? (
          <div className="${card}">
            <div className="flex items-start justify-between gap-4">
              <p className="font-display text-2xl font-semibold">{String(selected[label.key] ?? "")}</p>
              <button type="button" onClick={() => setEditing(!editing)} className="inline-flex items-center gap-1 rounded-btn border border-line px-3 py-1.5 text-sm"><Pencil className="size-3.5" />{editing ? "Listo" : "Editar"}</button>
            </div>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              {entity.fields.map((field) => (
                <div key={field.key}>
                  <dt className="text-xs uppercase tracking-wider text-muted">{field.label}</dt>
                  <dd className="mt-1 text-sm">
                    {editing && field.type !== "boolean" ? (
                      <input defaultValue={String(selected[field.key] ?? "")} type={inputType(field)} onBlur={(event) => store.update(selected.id, { [field.key]: field.type === "number" || field.type === "money" ? Number(event.target.value) : event.target.value })} className="${input}" />
                    ) : (
                      formatValue(field, selected[field.key])
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
    </div>`,
    }),

  "app-settings": (s) => {
    const fields = (s.content.fields ?? []).filter(Boolean).slice(0, 8);
    return moduleSource({
      name: s.name,
      imports: `${header(["CheckCircle2"], { react: ["useState", "type FormEvent"] })}\nimport { readSettings, writeSettings } from "../lib/data";`,
      content: { title: s.content.title, subtitle: s.content.subtitle ?? "", fields: fields.length ? fields : ["Nombre del negocio", "Teléfono", "Horario"] },
      pre: `  const [values, setValues] = useState<Record<string, string>>(() => readSettings());
  const [saved, setSaved] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    writeSettings(values);
    setSaved(true);
  }`,
      body: `<div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{content.title}</h1>
        {content.subtitle ? <p className="mt-1 text-sm text-muted">{content.subtitle}</p> : null}
      </div>
      <form onSubmit={submit} className="${card} grid gap-4">
        {content.fields.map((field) => (
          <label key={field} className="grid gap-1.5 text-sm font-medium">
            {field}
            <input value={values[field] ?? ""} onChange={(event) => { setSaved(false); setValues({ ...values, [field]: event.target.value }); }} className="${input}" />
          </label>
        ))}
        <div className="flex items-center gap-3">
          <button type="submit" className="${btnPrimary}">Guardar cambios</button>
          {saved ? <span className="inline-flex items-center gap-1 text-sm text-primary"><CheckCircle2 className="size-4" />Guardado</span> : null}
        </div>
      </form>
    </div>`,
    });
  },

  "app-chart": (s, ctx) =>
    moduleSource({
      name: s.name,
      imports: `${header(["BarChart3"], { data: true })}\nimport { formatValue } from "../lib/format";`,
      content: { title: s.content.title, subtitle: s.content.subtitle ?? "", entity: entityKey(s, ctx), field: selectFieldOf(s, ctx) },
      pre: `  const entity = schema[content.entity];
  const rows = useCollection(stores[content.entity]);
  const group = entity.fields.find((field) => field.key === content.field) ?? entity.fields.find((field) => field.type === "select");
  const money = entity.fields.find((field) => field.type === "money");
  const buckets = new Map<string, number>();
  for (const row of rows) {
    const key = group ? String(row[group.key] ?? "Sin dato") : new Date(row.createdAt).toLocaleDateString("es-MX", { month: "short" });
    buckets.set(key, (buckets.get(key) ?? 0) + (money ? Number(row[money.key]) || 0 : 1));
  }
  const data = [...buckets.entries()];
  const max = Math.max(1, ...data.map(([, value]) => value));`,
      body: `<div className="${card}">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-btn bg-surface-2 text-primary"><BarChart3 className="size-5" /></span>
        <div>
          <h2 className="font-display text-xl font-semibold">{content.title}</h2>
          {content.subtitle ? <p className="text-sm text-muted">{content.subtitle}</p> : null}
        </div>
      </div>
      {data.length ? (
        <div className="mt-8 flex h-56 items-end gap-3">
          {data.map(([name, value]) => (
            <div key={name} className="flex flex-1 flex-col items-center gap-2">
              <span className="text-xs font-semibold">{money ? formatValue(money, value) : value}</span>
              <div className="w-full rounded-t-btn bg-primary transition-all" style={{ height: Math.max(6, (value / max) * 180) + "px" }} />
              <span className="truncate text-xs text-muted">{name}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted">Agrega registros para ver la gráfica.</p>
      )}
    </div>`,
    }),

  "app-activity": (s, ctx) =>
    moduleSource({
      name: s.name,
      imports: `${header(["Activity"], { data: true })}\nimport { primaryField } from "../lib/format";`,
      content: { title: s.content.title, keys: ctx.plan.entities.map((entity) => entity.key).slice(0, 4) },
      pre: `  const lists = content.keys.map((key) => ({ key, rows: useCollection(stores[key]) }));
  const feed = lists
    .flatMap((entry) => entry.rows.map((row: Row) => ({ row, key: entry.key })))
    .sort((a, b) => b.row.updatedAt.localeCompare(a.row.updatedAt))
    .slice(0, 8);`,
      body: `<div className="${card}">
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold"><Activity className="size-5 text-primary" />{content.title}</h2>
      <ol className="mt-6 space-y-4">
        {feed.map(({ row, key }) => (
          <li key={key + row.id} className="flex gap-3 text-sm">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
            <span>
              <span className="font-medium">{String(row[primaryField(schema[key]).key] ?? "")}</span>
              <span className="text-muted"> · {schema[key].singular} · {new Date(row.updatedAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}</span>
            </span>
          </li>
        ))}
        {feed.length ? null : <li className="text-sm text-muted">Sin actividad todavía.</li>}
      </ol>
    </div>`,
    }),

  "app-pos": (s, ctx) => {
    const orders = ctx.plan.entities.find((entity) => /pedido|orden|venta/.test(entity.key))?.key ?? "";
    return moduleSource({
      name: s.name,
      imports: `${header(["Minus", "Plus", "ShoppingCart"], { data: true, react: ["useState"] })}\nimport { formatMoney, primaryField } from "../lib/format";`,
      content: { title: s.content.title, subtitle: s.content.subtitle ?? "", entity: entityKey(s, ctx), orders },
      pre: `  const entity = schema[content.entity];
  const products = useCollection(stores[content.entity]);
  const label = primaryField(entity);
  const priceField = entity.fields.find((field) => field.type === "money");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [done, setDone] = useState("");
  const lines = products.filter((product: Row) => cart[product.id]);
  const total = lines.reduce((sum, product: Row) => sum + (Number(product[priceField?.key ?? ""]) || 0) * cart[product.id], 0);
  function change(id: string, step: number) {
    setDone("");
    setCart((current) => {
      const next = { ...current, [id]: Math.max(0, (current[id] ?? 0) + step) };
      if (!next[id]) delete next[id];
      return next;
    });
  }
  function checkout() {
    const summary = lines.map((product: Row) => cart[product.id] + " × " + String(product[label.key])).join(", ");
    if (content.orders && stores[content.orders]) {
      const target = schema[content.orders];
      const values: Record<string, unknown> = {};
      const text = target.fields.find((field) => field.type === "text" || field.type === "longtext");
      const money = target.fields.find((field) => field.type === "money");
      if (text) values[text.key] = summary;
      if (money) values[money.key] = total;
      stores[content.orders].create(values);
    }
    setCart({});
    setDone("Pedido registrado: " + summary);
  }`,
      body: `<div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{content.title}</h1>
        {content.subtitle ? <p className="mt-1 text-sm text-muted">{content.subtitle}</p> : null}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product: Row) => (
            <button key={product.id} type="button" onClick={() => change(product.id, 1)} className="rounded-card border border-line bg-surface p-4 text-left transition hover:border-primary">
              <p className="font-semibold">{String(product[label.key] ?? "")}</p>
              {priceField ? <p className="mt-1 text-sm text-primary">{formatMoney(Number(product[priceField.key]) || 0)}</p> : null}
            </button>
          ))}
        </div>
      </div>
      <aside className="${card} h-fit lg:sticky lg:top-6">
        <p className="flex items-center gap-2 font-display text-lg font-semibold"><ShoppingCart className="size-5 text-primary" />Pedido</p>
        <ul className="mt-4 divide-y divide-line">
          {lines.map((product: Row) => (
            <li key={product.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>{String(product[label.key])}</span>
              <span className="flex items-center gap-2">
                <button type="button" onClick={() => change(product.id, -1)} className="rounded-btn border border-line p-1" aria-label="Quitar uno"><Minus className="size-3" /></button>
                {cart[product.id]}
                <button type="button" onClick={() => change(product.id, 1)} className="rounded-btn border border-line p-1" aria-label="Agregar uno"><Plus className="size-3" /></button>
              </span>
            </li>
          ))}
          {lines.length ? null : <li className="py-4 text-sm text-muted">Toca un producto para agregarlo.</li>}
        </ul>
        <p className="mt-4 flex justify-between border-t border-line pt-4 font-semibold"><span>Total</span><span>{formatMoney(total)}</span></p>
        <button type="button" disabled={!lines.length} onClick={checkout} className="mt-4 w-full ${btnPrimary} disabled:opacity-40">Cobrar</button>
        {done ? <p className="mt-3 text-xs text-muted">{done}</p> : null}
      </aside>
    </div>`,
    });
  },

  "app-welcome": (s) => {
    const list = withIcons(items(s.content, 3, (index) => ({ title: `Paso ${index + 1}`, text: "", meta: "/" })).slice(0, 4), "Sparkles");
    const icons = iconsFor(list, "Sparkles");
    return moduleSource({
      name: s.name,
      imports: header([...icons, "ArrowRight"], { link: true }),
      extra: iconMap(icons),
      content: { title: s.content.title, subtitle: s.content.subtitle ?? "", items: list.map((item) => ({ ...item, meta: item.meta && item.meta.startsWith("/") ? item.meta : "/" })) },
      body: `<div className="space-y-8">
      <div className="relative overflow-hidden rounded-card bg-primary p-8 text-primary-ink shadow-card sm:p-10">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
        <h1 className="relative font-display text-3xl font-bold tracking-tight sm:text-4xl">{content.title}</h1>
        {content.subtitle ? <p className="relative mt-3 max-w-xl opacity-85">{content.subtitle}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {content.items.map((item) => {
          const Icon = icons[item.icon as keyof typeof icons] ?? Sparkles;
          return (
            <Link key={item.title} to={item.meta} className="group ${card} transition hover:-translate-y-1">
              <Icon className="size-6 text-primary" />
              <p className="mt-4 font-semibold">{item.title}</p>
              {item.text ? <p className="mt-1 text-sm text-muted">{item.text}</p> : null}
              <ArrowRight className="mt-4 size-4 text-muted transition group-hover:translate-x-1 group-hover:text-primary" />
            </Link>
          );
        })}
      </div>
    </div>`,
    });
  },
};
