// Pantallas del restaurante con datos en vivo (código de la app generada, determinista).
// No usan `${` ni comillas invertidas: así viven como texto plano en este módulo.

export const restaurantHelpers = (title: string) =>
  'export const appTitle = ' + JSON.stringify(title) + ';\n' +
  String.raw`// Reglas del restaurante: totales, inventario por receta, fechas y menú por rol.
import { useEffect, useState } from "react";

import { stores, type Row } from "../data/stores";

export type Item = { platillo: string; nombre: string; cantidad: number; precio: number; nota?: string };
export type RecetaLinea = { insumo: string; cantidad: number };

export const estadosAbiertos = ["En cocina", "Lista", "Entregada"];
export const categorias = ["Entradas", "Platos fuertes", "Antojitos", "Bebidas", "Postres"];
export const metodos = ["Efectivo", "Tarjeta", "Transferencia"];

const pesos = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function money(value: unknown) {
  return pesos.format(Number(value) || 0);
}

export function itemsOf(row: Row | undefined): Item[] {
  return row && Array.isArray(row.items) ? (row.items as Item[]) : [];
}

export function recetaOf(row: Row | undefined): RecetaLinea[] {
  return row && Array.isArray(row.receta) ? (row.receta as RecetaLinea[]) : [];
}

export function totalOf(items: Item[]) {
  return items.reduce((sum, item) => sum + (Number(item.cantidad) || 0) * (Number(item.precio) || 0), 0);
}

export function stockId(branch: string, insumo: string) {
  return branch + "_" + insumo;
}

/** Movimientos de inventario de unos platillos (sign -1 al mandar a cocina, +1 al cancelar). */
export function stockMoves(items: Item[], branch: string, sign: 1 | -1) {
  const totals = new Map<string, number>();
  for (const item of items) {
    for (const line of recetaOf(stores.platillos.get(item.platillo))) {
      const id = stockId(branch, line.insumo);
      if (!stores.existencias.get(id)) continue;
      totals.set(id, (totals.get(id) ?? 0) + (Number(line.cantidad) || 0) * (Number(item.cantidad) || 0) * sign);
    }
  }
  return [...totals.entries()].filter(([, by]) => by !== 0).map(([id, by]) => ({ id, by: Math.round(by * 1000) / 1000 }));
}

export function applyStock(moves: { id: string; by: number }[]) {
  for (const move of moves) stores.existencias.inc(move.id, "cantidad", move.by);
}

export function sameDay(value: unknown, now = new Date()) {
  if (typeof value !== "string" || !value) return false;
  const date = new Date(value);
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

export function minutesSince(value: unknown, now: number) {
  const time = typeof value === "string" ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(time) ? Math.max(0, Math.floor((now - time) / 60000)) : 0;
}

export function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export const pantallas = [
  { path: "/mesero", label: "Tomar pedido", roles: ["mesero"] },
  { path: "/cocina", label: "Cocina", roles: ["cocina"] },
  { path: "/caja", label: "Caja", roles: ["caja"] },
  { path: "/inventario", label: "Inventario", roles: ["caja"] },
  { path: "/resumen", label: "Resumen", roles: [] as string[] },
  { path: "/menu", label: "Menú e insumos", roles: [] as string[] },
];

export function pantallasDe(role: string) {
  return pantallas.filter((item) => role === "admin" || item.roles.includes(role));
}

export function inicioDe(role: string) {
  if (role === "mesero") return "/mesero";
  if (role === "cocina") return "/cocina";
  if (role === "caja") return "/caja";
  return "/resumen";
}

export const card = "rounded-card border border-line bg-surface p-4 shadow-card";
export const button = "inline-flex items-center justify-center gap-2 rounded-btn px-4 py-2 text-sm font-semibold transition disabled:opacity-40";
export const primary = button + " bg-primary text-primary-ink hover:opacity-90";
export const ghost = button + " border border-line bg-surface text-ink hover:bg-surface-2";
export const input = "w-full rounded-input border border-line bg-bg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/40";
`;

export const restaurantApp = String.raw`import type { ComponentType } from "react";

import LiveGate from "./components/LiveGate";
import { useLive } from "./lib/data";
import { RouterProvider, useRoute } from "./lib/router";
import Caja from "./pages/Caja";
import Cocina from "./pages/Cocina";
import Inicio from "./pages/Inicio";
import Inventario from "./pages/Inventario";
import Layout from "./pages/Layout";
import Menu from "./pages/Menu";
import Mesero from "./pages/Mesero";
import Resumen from "./pages/Resumen";
import { pantallasDe } from "./pages/restaurante";

const routes: Record<string, ComponentType> = {
  "/": Inicio,
  "/mesero": Mesero,
  "/cocina": Cocina,
  "/caja": Caja,
  "/inventario": Inventario,
  "/resumen": Resumen,
  "/menu": Menu,
};

function Current() {
  const { path } = useRoute();
  const live = useLive();
  const role = live.member?.role ?? "admin";
  const allowed = path === "/" || pantallasDe(role).some((item) => item.path === path);
  const Page = allowed ? routes[path] ?? Inicio : Inicio;
  return <Page />;
}

export default function App() {
  return (
    <LiveGate>
      <RouterProvider>
        <Layout>
          <Current />
        </Layout>
      </RouterProvider>
    </LiveGate>
  );
}
`;

export const restaurantPages: Record<string, string> = {
  "src/pages/Layout.tsx": String.raw`import type { ReactNode } from "react";

import { BranchSwitcher } from "../components/LiveGate";
import { useLive } from "../lib/data";
import { previewAs } from "../lib/live";
import { Link, useRoute } from "../lib/router";
import { appTitle, pantallasDe } from "./restaurante";

export default function Layout({ children }: { children: ReactNode }) {
  const live = useLive();
  const { path } = useRoute();
  const role = live.member?.role ?? "admin";
  const roleLabel = live.roles.find((item) => item.key === role)?.label ?? role;
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/" className="font-display text-lg font-bold text-ink">
            {appTitle}
          </Link>
          <nav className="order-last -mx-1 flex w-full gap-1 overflow-x-auto px-1 sm:order-none sm:mx-0 sm:w-auto sm:flex-1 sm:px-0" aria-label="Pantallas">
            {pantallasDe(role).map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={"whitespace-nowrap rounded-btn px-3 py-1.5 text-sm font-medium " + (path === item.path ? "bg-primary text-primary-ink" : "text-muted hover:bg-surface-2")}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <BranchSwitcher className="ml-auto sm:ml-0" />
          <span className="text-xs text-muted">
            {live.member?.name} · {roleLabel}
          </span>
          {live.status === "local" ? (
            <select aria-label="Ver como" className="rounded-input border border-line bg-surface px-2 py-1 text-xs" value={role} onChange={(event) => previewAs(event.target.value)}>
              {live.roles.map((item) => (
                <option key={item.key} value={item.key}>
                  Ver como {item.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
`,

  "src/pages/Inicio.tsx": String.raw`import { useLive } from "../lib/data";
import Caja from "./Caja";
import Cocina from "./Cocina";
import Mesero from "./Mesero";
import Resumen from "./Resumen";
import { inicioDe } from "./restaurante";

export default function Inicio() {
  const live = useLive();
  const start = inicioDe(live.member?.role ?? "admin");
  if (start === "/mesero") return <Mesero />;
  if (start === "/cocina") return <Cocina />;
  if (start === "/caja") return <Caja />;
  return <Resumen />;
}
`,

  "src/pages/Mesero.tsx": String.raw`import { Minus, Plus, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { stores } from "../data/stores";
import { transact, useCollection, useLive } from "../lib/data";
import { applyStock, card, categorias, estadosAbiertos, ghost, input, itemsOf, money, primary, stockMoves, totalOf, type Item } from "./restaurante";

const mesas = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "Para llevar"];

export default function Mesero() {
  const live = useLive();
  const platillos = useCollection(stores.platillos).filter((row) => row.activo !== false);
  const comandas = useCollection(stores.comandas);
  const [mesa, setMesa] = useState("1");
  const [draft, setDraft] = useState<Item[]>([]);
  const [categoria, setCategoria] = useState("Todas");
  const [aviso, setAviso] = useState("");
  const branch = live.branch ?? live.member?.branchId ?? "";

  const visibles = useMemo(() => platillos.filter((row) => categoria === "Todas" || row.categoria === categoria), [platillos, categoria]);
  const abiertas = comandas.filter((row) => estadosAbiertos.includes(String(row.estado))).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const total = totalOf(draft);

  function agregar(id: string) {
    const platillo = stores.platillos.get(id);
    if (!platillo) return;
    setAviso("");
    setDraft((current) => {
      const index = current.findIndex((item) => item.platillo === id && !item.nota);
      if (index >= 0) return current.map((item, position) => (position === index ? { ...item, cantidad: item.cantidad + 1 } : item));
      return [...current, { platillo: id, nombre: String(platillo.nombre), cantidad: 1, precio: Number(platillo.precio) || 0 }];
    });
  }

  function cambiar(index: number, delta: number) {
    setDraft((current) => current.map((item, position) => (position === index ? { ...item, cantidad: item.cantidad + delta } : item)).filter((item) => item.cantidad > 0));
  }

  function nota(index: number, text: string) {
    setDraft((current) => current.map((item, position) => (position === index ? { ...item, nota: text } : item)));
  }

  function enviar() {
    if (!draft.length) return;
    if (!branch) {
      setAviso("Elige una sucursal arriba para tomar el pedido.");
      return;
    }
    const items = draft.map((item) => (item.nota ? item : { platillo: item.platillo, nombre: item.nombre, cantidad: item.cantidad, precio: item.precio }));
    transact(() => {
      stores.comandas.create({ mesa, mesero: live.member?.name ?? "", estado: "En cocina", items, total: totalOf(items), branchId: branch });
      applyStock(stockMoves(items, branch, -1));
    });
    setDraft([]);
    setAviso("Comanda de la mesa " + mesa + " enviada a cocina.");
  }

  function cancelar(id: string) {
    const row = stores.comandas.get(id);
    if (!row || row.estado !== "En cocina") return;
    transact(() => {
      stores.comandas.update(id, { estado: "Cancelada" });
      applyStock(stockMoves(itemsOf(row), String(row.branchId ?? branch), 1));
    });
  }

  return (
    <div className="grid gap-6 pb-24 lg:grid-cols-[1fr_380px] lg:pb-0">
      <section aria-label="Menú">
        <div className="mb-3 flex flex-wrap gap-2">
          {["Todas", ...categorias].map((item) => (
            <button key={item} type="button" onClick={() => setCategoria(item)} className={"rounded-btn px-3 py-1.5 text-sm " + (categoria === item ? "bg-primary text-primary-ink" : "bg-surface-2 text-ink")}>
              {item}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {visibles.map((row) => (
            <button key={row.id} type="button" onClick={() => agregar(row.id)} className={card + " text-left transition hover:border-primary active:scale-[0.98]"} data-testid="platillo">
              <span className="block font-semibold text-ink">{String(row.nombre)}</span>
              <span className="mt-1 block text-sm text-muted">{String(row.categoria ?? "")}</span>
              <span className="mt-2 block font-display text-lg text-primary">{money(row.precio)}</span>
            </button>
          ))}
          {!visibles.length ? <p className="text-sm text-muted">No hay platillos en esta categoría.</p> : null}
        </div>
      </section>

      <aside className="space-y-4">
        <div className={card}>
          <h2 className="font-display text-lg font-bold">Nueva comanda</h2>
          <label className="mt-3 block text-sm font-medium text-muted" htmlFor="mesa">
            Mesa
          </label>
          <div id="mesa" className="mt-1 flex flex-wrap gap-1.5">
            {mesas.map((item) => (
              <button key={item} type="button" onClick={() => setMesa(item)} className={"min-w-9 rounded-btn px-2 py-1 text-sm " + (mesa === item ? "bg-primary text-primary-ink" : "bg-surface-2 text-ink")}>
                {item}
              </button>
            ))}
          </div>
          <ul className="mt-4 space-y-3" aria-label="Platillos de la comanda">
            {draft.map((item, index) => (
              <li key={item.platillo + index} className="rounded-input border border-line p-2">
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm font-medium">{item.nombre}</span>
                  <button type="button" aria-label="Quitar uno" onClick={() => cambiar(index, -1)} className="rounded-btn bg-surface-2 p-1">
                    <Minus size={14} />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold">{item.cantidad}</span>
                  <button type="button" aria-label="Agregar uno" onClick={() => cambiar(index, 1)} className="rounded-btn bg-surface-2 p-1">
                    <Plus size={14} />
                  </button>
                  <span className="w-20 text-right text-sm">{money(item.cantidad * item.precio)}</span>
                </div>
                <input className={input + " mt-2 py-1 text-xs"} placeholder="Nota para cocina (sin cebolla, término…)" value={item.nota ?? ""} onChange={(event) => nota(index, event.target.value)} />
              </li>
            ))}
            {!draft.length ? <li className="text-sm text-muted">Toca un platillo para agregarlo.</li> : null}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
            <span className="text-sm text-muted">Total</span>
            <span className="font-display text-xl font-bold" data-testid="draft-total">
              {money(total)}
            </span>
          </div>
          <button type="button" className={primary + " mt-3 w-full"} disabled={!draft.length} onClick={enviar}>
            <Send size={16} /> Enviar a cocina
          </button>
          {aviso ? (
            <p role="status" className="mt-2 text-sm text-muted">
              {aviso}
            </p>
          ) : null}
        </div>

        <div className={card}>
          <h2 className="font-display text-base font-bold">Comandas abiertas</h2>
          <ul className="mt-2 space-y-2">
            {abiertas.map((row) => (
              <li key={row.id} className="flex items-center gap-2 text-sm" data-testid="comanda-abierta">
                <span className="flex-1">
                  Mesa {String(row.mesa)} · {money(row.total)}
                </span>
                <span className={"rounded-btn px-2 py-0.5 text-xs " + (row.estado === "Lista" ? "bg-primary text-primary-ink" : "bg-surface-2 text-muted")}>{String(row.estado)}</span>
                {row.estado === "Lista" ? (
                  <button type="button" className={ghost + " px-2 py-1 text-xs"} onClick={() => stores.comandas.update(row.id, { estado: "Entregada" })}>
                    Entregada
                  </button>
                ) : null}
                {row.estado === "En cocina" ? (
                  <button type="button" aria-label="Cancelar comanda" className="rounded-btn p-1 text-muted hover:text-ink" onClick={() => cancelar(row.id)}>
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </li>
            ))}
            {!abiertas.length ? <li className="text-sm text-muted">Sin comandas abiertas.</li> : null}
          </ul>
        </div>
      </aside>

      {draft.length ? (
        <div className="fixed inset-x-3 bottom-14 z-30 flex items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-card lg:hidden">
          <span className="flex-1 text-sm">
            Mesa {mesa} · {draft.reduce((sum, item) => sum + item.cantidad, 0)} platillos · <strong>{money(total)}</strong>
          </span>
          <button type="button" className={primary} onClick={enviar}>
            <Send size={16} /> Enviar
          </button>
        </div>
      ) : null}
    </div>
  );
}
`,

  "src/pages/Cocina.tsx": String.raw`import { Check, Clock } from "lucide-react";

import { stores } from "../data/stores";
import { useCollection } from "../lib/data";
import { card, itemsOf, minutesSince, primary, useNow } from "./restaurante";

export default function Cocina() {
  const comandas = useCollection(stores.comandas);
  const now = useNow(15000);
  const pendientes = comandas.filter((row) => row.estado === "En cocina").sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const listas = comandas
    .filter((row) => row.estado === "Lista")
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 8);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <section aria-label="En preparación">
        <h1 className="mb-3 font-display text-2xl font-bold">En preparación ({pendientes.length})</h1>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {pendientes.map((row) => {
            const minutes = minutesSince(row.createdAt, now);
            return (
              <article key={row.id} className={card + (minutes >= 15 ? " border-primary" : "")} data-testid="ticket-cocina">
                <header className="flex items-center justify-between">
                  <h2 className="font-display text-xl font-bold">Mesa {String(row.mesa)}</h2>
                  <span className={"inline-flex items-center gap-1 text-sm " + (minutes >= 15 ? "font-bold text-primary" : "text-muted")}>
                    <Clock size={14} /> {minutes} min
                  </span>
                </header>
                <p className="text-xs text-muted">{String(row.mesero ?? "")}</p>
                <ul className="mt-3 space-y-1.5">
                  {itemsOf(row).map((item, index) => (
                    <li key={index} className="text-sm">
                      <span className="font-semibold">{item.cantidad} ×</span> {item.nombre}
                      {item.nota ? <span className="block pl-5 text-xs text-primary">{item.nota}</span> : null}
                    </li>
                  ))}
                </ul>
                <button type="button" className={primary + " mt-4 w-full"} onClick={() => stores.comandas.update(row.id, { estado: "Lista" })}>
                  <Check size={16} /> Marcar lista
                </button>
              </article>
            );
          })}
          {!pendientes.length ? <p className="text-muted">No hay comandas pendientes. Las nuevas aparecen aquí solas.</p> : null}
        </div>
      </section>
      <aside className={card}>
        <h2 className="font-display text-base font-bold">Listas para entregar</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {listas.map((row) => (
            <li key={row.id} className="flex justify-between">
              <span>Mesa {String(row.mesa)}</span>
              <span className="text-muted">hace {minutesSince(row.updatedAt, now)} min</span>
            </li>
          ))}
          {!listas.length ? <li className="text-muted">Nada por entregar.</li> : null}
        </ul>
      </aside>
    </div>
  );
}
`,

  "src/pages/Caja.tsx": String.raw`import { Receipt } from "lucide-react";
import { useState } from "react";

import { stores, type Row } from "../data/stores";
import { transact, useCollection } from "../lib/data";
import { card, estadosAbiertos, input, itemsOf, metodos, money, primary, sameDay } from "./restaurante";

export default function Caja() {
  const comandas = useCollection(stores.comandas);
  const [metodo, setMetodo] = useState<Record<string, string>>({});
  const [propina, setPropina] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState("");

  const porMesa = new Map<string, Row[]>();
  for (const row of comandas) {
    if (!estadosAbiertos.includes(String(row.estado))) continue;
    const key = String(row.branchId ?? "") + "|" + String(row.mesa);
    porMesa.set(key, [...(porMesa.get(key) ?? []), row]);
  }
  const mesas = [...porMesa.entries()].sort((a, b) => a[0].localeCompare(b[0], "es", { numeric: true }));
  const pagadas = comandas.filter((row) => row.estado === "Pagada" && sameDay(row.cerradaEn));
  const ventas = pagadas.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
  const propinas = pagadas.reduce((sum, row) => sum + (Number(row.propina) || 0), 0);

  function cobrar(key: string, rows: Row[]) {
    const forma = metodo[key] ?? "Efectivo";
    const extra = Number(propina[key]) || 0;
    const cuando = new Date().toISOString();
    transact(() => {
      rows.forEach((row, index) => stores.comandas.update(row.id, { estado: "Pagada", metodo: forma, propina: index === 0 ? extra : 0, cerradaEn: cuando }));
    });
    setAviso("Mesa " + String(rows[0].mesa) + " cobrada.");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section aria-label="Por cobrar">
        <h1 className="mb-3 font-display text-2xl font-bold">Por cobrar</h1>
        {aviso ? (
          <p role="status" className="mb-3 text-sm text-muted">
            {aviso}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {mesas.map(([key, rows]) => {
            const items = rows.flatMap((row) => itemsOf(row));
            const total = rows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
            const pendiente = rows.some((row) => row.estado === "En cocina");
            return (
              <article key={key} className={card} data-testid="mesa-por-cobrar">
                <header className="flex items-center justify-between">
                  <h2 className="font-display text-xl font-bold">Mesa {String(rows[0].mesa)}</h2>
                  <span className="font-display text-xl">{money(total)}</span>
                </header>
                <ul className="mt-2 space-y-1 text-sm text-muted">
                  {items.map((item, index) => (
                    <li key={index} className="flex justify-between">
                      <span>
                        {item.cantidad} × {item.nombre}
                      </span>
                      <span>{money(item.cantidad * item.precio)}</span>
                    </li>
                  ))}
                </ul>
                {pendiente ? <p className="mt-2 text-xs text-primary">Hay platillos aún en cocina.</p> : null}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <select aria-label="Forma de pago" className={input} value={metodo[key] ?? "Efectivo"} onChange={(event) => setMetodo({ ...metodo, [key]: event.target.value })}>
                    {metodos.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                  <input aria-label="Propina" className={input} inputMode="decimal" placeholder="Propina" value={propina[key] ?? ""} onChange={(event) => setPropina({ ...propina, [key]: event.target.value })} />
                </div>
                <button type="button" className={primary + " mt-3 w-full"} onClick={() => cobrar(key, rows)}>
                  <Receipt size={16} /> Cobrar {money(total + (Number(propina[key]) || 0))}
                </button>
              </article>
            );
          })}
          {!mesas.length ? <p className="text-muted">No hay mesas por cobrar.</p> : null}
        </div>
      </section>
      <aside className={card}>
        <h2 className="font-display text-base font-bold">Corte de hoy</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Ventas</dt>
            <dd className="font-semibold" data-testid="ventas-hoy">
              {money(ventas)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Propinas</dt>
            <dd>{money(propinas)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Comandas cobradas</dt>
            <dd>{pagadas.length}</dd>
          </div>
          {metodos.map((item) => (
            <div key={item} className="flex justify-between">
              <dt className="text-muted">{item}</dt>
              <dd>{money(pagadas.filter((row) => row.metodo === item).reduce((sum, row) => sum + (Number(row.total) || 0) + (Number(row.propina) || 0), 0))}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}
`,

  "src/pages/Inventario.tsx": String.raw`import { AlertTriangle, PackagePlus } from "lucide-react";
import { useState } from "react";

import { stores } from "../data/stores";
import { transact, useCollection, useLive } from "../lib/data";
import { card, ghost, input, primary, stockId } from "./restaurante";

const tipos = ["Compra", "Merma", "Conteo"];

export default function Inventario() {
  const live = useLive();
  const insumos = useCollection(stores.insumos);
  const existencias = useCollection(stores.existencias, { allBranches: true });
  const movimientos = useCollection(stores.movimientos).slice(0, 12);
  const [tipo, setTipo] = useState("Compra");
  const [insumo, setInsumo] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [nota, setNota] = useState("");
  const [aviso, setAviso] = useState("");
  const sucursales = live.branch ? live.branches.filter((item) => item.id === live.branch) : live.branches;
  const cantidadDe = (branch: string, id: string) => {
    const row = existencias.find((item) => item.id === stockId(branch, id));
    return row ? Number(row.cantidad) || 0 : null;
  };
  const faltantes = sucursales.flatMap((branch) => insumos.filter((row) => cantidadDe(branch.id, row.id) === null).map((row) => ({ branch: branch.id, insumo: row.id })));

  function registrar() {
    const elegido = insumo || insumos[0]?.id;
    const valor = Number(cantidad);
    if (!live.branch) return setAviso("Elige una sucursal arriba para registrar movimientos.");
    if (!elegido || !Number.isFinite(valor) || cantidad === "") return setAviso("Elige el insumo y la cantidad.");
    const id = stockId(live.branch, elegido);
    const actual = cantidadDe(live.branch, elegido);
    const by = tipo === "Compra" ? valor : tipo === "Merma" ? -valor : valor - (actual ?? 0);
    transact(() => {
      if (actual === null) stores.existencias.create({ id, insumo: elegido, cantidad: 0, branchId: live.branch });
      if (by !== 0) stores.existencias.inc(id, "cantidad", by);
      stores.movimientos.create({ tipo, insumo: elegido, cantidad: valor, nota, persona: live.member?.name ?? "", branchId: live.branch });
    });
    setCantidad("");
    setNota("");
    setAviso(tipo + " registrada.");
  }

  function crearFaltantes() {
    transact(() => {
      for (const item of faltantes) stores.existencias.create({ id: stockId(item.branch, item.insumo), insumo: item.insumo, cantidad: 0, branchId: item.branch });
    });
  }

  return (
    <div className="space-y-6">
      <section className={card} aria-label="Existencias">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-2xl font-bold">Inventario</h1>
          {faltantes.length && live.member?.role === "admin" ? (
            <button type="button" className={ghost} onClick={crearFaltantes}>
              Crear {faltantes.length} existencias en 0
            </button>
          ) : null}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="py-2 pr-3 font-medium">Insumo</th>
                {sucursales.map((branch) => (
                  <th key={branch.id} className="py-2 pr-3 font-medium">
                    {branch.name}
                  </th>
                ))}
                <th className="py-2 font-medium">Mínimo</th>
              </tr>
            </thead>
            <tbody>
              {insumos.map((row) => (
                <tr key={row.id} className="border-b border-line/60">
                  <td className="py-2 pr-3 font-medium">{String(row.nombre)}</td>
                  {sucursales.map((branch) => {
                    const value = cantidadDe(branch.id, row.id);
                    const bajo = value !== null && value <= (Number(row.minimo) || 0);
                    return (
                      <td key={branch.id} className={"py-2 pr-3 " + (bajo ? "font-bold text-primary" : "")} data-testid={"stock-" + branch.id + "-" + row.id}>
                        {value === null ? "—" : value.toLocaleString("es-MX", { maximumFractionDigits: 3 }) + " " + String(row.unidad ?? "")}
                        {bajo ? <AlertTriangle size={13} className="ml-1 inline" aria-label="Bajo mínimo" /> : null}
                      </td>
                    );
                  })}
                  <td className="py-2 text-muted">
                    {String(row.minimo ?? 0)} {String(row.unidad ?? "")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={card} aria-label="Registrar movimiento">
          <h2 className="font-display text-lg font-bold">Registrar compra, merma o conteo</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <select aria-label="Tipo" className={input} value={tipo} onChange={(event) => setTipo(event.target.value)}>
              {tipos.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select aria-label="Insumo" className={input} value={insumo || insumos[0]?.id || ""} onChange={(event) => setInsumo(event.target.value)}>
              {insumos.map((row) => (
                <option key={row.id} value={row.id}>
                  {String(row.nombre)}
                </option>
              ))}
            </select>
            <input aria-label="Cantidad" className={input} inputMode="decimal" placeholder={tipo === "Conteo" ? "Cantidad contada" : "Cantidad"} value={cantidad} onChange={(event) => setCantidad(event.target.value)} />
            <input aria-label="Nota" className={input} placeholder="Nota (proveedor, motivo…)" value={nota} onChange={(event) => setNota(event.target.value)} />
          </div>
          <button type="button" className={primary + " mt-3"} onClick={registrar}>
            <PackagePlus size={16} /> Registrar
          </button>
          {aviso ? (
            <p role="status" className="mt-2 text-sm text-muted">
              {aviso}
            </p>
          ) : null}
        </section>
        <section className={card} aria-label="Movimientos recientes">
          <h2 className="font-display text-lg font-bold">Movimientos recientes</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {movimientos.map((row) => (
              <li key={row.id} className="flex justify-between gap-2">
                <span>
                  {String(row.tipo)} · {String(stores.insumos.get(String(row.insumo))?.nombre ?? row.insumo)}
                </span>
                <span className="text-muted">
                  {String(row.cantidad)} · {String(row.persona ?? "")}
                </span>
              </li>
            ))}
            {!movimientos.length ? <li className="text-muted">Aún no hay movimientos.</li> : null}
          </ul>
        </section>
      </div>
    </div>
  );
}
`,

  "src/pages/Resumen.tsx": String.raw`import { stores } from "../data/stores";
import { useCollection, useLive } from "../lib/data";
import { card, estadosAbiertos, itemsOf, money, sameDay, stockId } from "./restaurante";

export default function Resumen() {
  const live = useLive();
  const comandas = useCollection(stores.comandas, { allBranches: true });
  const existencias = useCollection(stores.existencias, { allBranches: true });
  const insumos = useCollection(stores.insumos);
  const sucursales = live.branch ? live.branches.filter((item) => item.id === live.branch) : live.branches;

  const datos = sucursales.map((branch) => {
    const propias = comandas.filter((row) => row.branchId === branch.id);
    const pagadas = propias.filter((row) => row.estado === "Pagada" && sameDay(row.cerradaEn));
    const bajos = insumos.filter((row) => {
      const stock = existencias.find((item) => item.id === stockId(branch.id, row.id));
      return stock && (Number(stock.cantidad) || 0) <= (Number(row.minimo) || 0);
    });
    return {
      branch,
      ventas: pagadas.reduce((sum, row) => sum + (Number(row.total) || 0), 0),
      tickets: pagadas.length,
      abiertas: propias.filter((row) => estadosAbiertos.includes(String(row.estado))).length,
      cocina: propias.filter((row) => row.estado === "En cocina").length,
      bajos,
    };
  });

  const vendidos = new Map<string, number>();
  for (const row of comandas) {
    if (row.estado !== "Pagada" || !sameDay(row.cerradaEn) || (live.branch && row.branchId !== live.branch)) continue;
    for (const item of itemsOf(row)) vendidos.set(item.nombre, (vendidos.get(item.nombre) ?? 0) + item.cantidad);
  }
  const top = [...vendidos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const total = datos.reduce((sum, item) => sum + item.ventas, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold">Resumen de hoy</h1>
          <p className="text-sm text-muted">Se actualiza solo con lo que pasa en cada sucursal.</p>
        </div>
        <p className="font-display text-3xl font-bold" data-testid="ventas-total">
          {money(total)}
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {datos.map((item) => (
          <article key={item.branch.id} className={card} data-testid={"resumen-" + item.branch.id}>
            <h2 className="font-display text-xl font-bold">{item.branch.name}</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted">Ventas</dt>
                <dd className="font-display text-xl" data-testid={"ventas-" + item.branch.id}>
                  {money(item.ventas)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Cuentas cobradas</dt>
                <dd className="font-display text-xl">{item.tickets}</dd>
              </div>
              <div>
                <dt className="text-muted">Comandas abiertas</dt>
                <dd>{item.abiertas}</dd>
              </div>
              <div>
                <dt className="text-muted">En cocina</dt>
                <dd>{item.cocina}</dd>
              </div>
            </dl>
            <p className={"mt-3 text-sm " + (item.bajos.length ? "text-primary" : "text-muted")}>
              {item.bajos.length ? "Bajo mínimo: " + item.bajos.map((row) => String(row.nombre)).join(", ") : "Inventario sin alertas."}
            </p>
          </article>
        ))}
      </div>
      <section className={card}>
        <h2 className="font-display text-lg font-bold">Lo más vendido hoy</h2>
        <ol className="mt-2 space-y-1 text-sm">
          {top.map(([nombre, cantidad]) => (
            <li key={nombre} className="flex justify-between">
              <span>{nombre}</span>
              <span className="text-muted">{cantidad}</span>
            </li>
          ))}
          {!top.length ? <li className="text-muted">Todavía no hay ventas hoy.</li> : null}
        </ol>
      </section>
    </div>
  );
}
`,

  "src/pages/Menu.tsx": String.raw`import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { stores } from "../data/stores";
import { transact, useCollection, useLive } from "../lib/data";
import { card, categorias, ghost, input, money, primary, recetaOf, stockId, type RecetaLinea } from "./restaurante";

const unidades = ["kg", "g", "l", "pza"];

export default function Menu() {
  const live = useLive();
  const platillos = useCollection(stores.platillos);
  const insumos = useCollection(stores.insumos);
  const [nuevo, setNuevo] = useState({ nombre: "", categoria: categorias[1], precio: "" });
  const [receta, setReceta] = useState<RecetaLinea[]>([]);
  const [insumo, setInsumo] = useState({ nombre: "", unidad: "kg", minimo: "" });
  const [aviso, setAviso] = useState("");

  function crearPlatillo() {
    if (!nuevo.nombre.trim() || nuevo.precio === "") return setAviso("Escribe el nombre y el precio.");
    stores.platillos.create({ nombre: nuevo.nombre.trim(), categoria: nuevo.categoria, precio: Number(nuevo.precio) || 0, activo: true, receta: receta.filter((line) => line.insumo && line.cantidad > 0) });
    setNuevo({ nombre: "", categoria: nuevo.categoria, precio: "" });
    setReceta([]);
    setAviso("Platillo agregado.");
  }

  function crearInsumo() {
    if (!insumo.nombre.trim()) return setAviso("Escribe el nombre del insumo.");
    transact(() => {
      const row = stores.insumos.create({ nombre: insumo.nombre.trim(), unidad: insumo.unidad, minimo: Number(insumo.minimo) || 0 });
      for (const branch of live.branches) stores.existencias.create({ id: stockId(branch.id, row.id), insumo: row.id, cantidad: 0, branchId: branch.id });
    });
    setInsumo({ nombre: "", unidad: insumo.unidad, minimo: "" });
    setAviso("Insumo agregado en todas las sucursales.");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className={card} aria-label="Platillos">
        <h1 className="font-display text-2xl font-bold">Menú</h1>
        <ul className="mt-3 divide-y divide-line">
          {platillos.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 py-2">
              <div className="min-w-40 flex-1">
                <p className="font-medium">{String(row.nombre)}</p>
                <p className="text-xs text-muted">
                  {String(row.categoria ?? "")} · receta: {recetaOf(row).map((line) => String(stores.insumos.get(line.insumo)?.nombre ?? line.insumo) + " " + line.cantidad).join(", ") || "sin receta"}
                </p>
              </div>
              <label className="flex items-center gap-1 text-sm">
                $
                <input
                  aria-label={"Precio de " + String(row.nombre)}
                  className={input + " w-24 py-1"}
                  inputMode="decimal"
                  defaultValue={String(row.precio ?? "")}
                  onBlur={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value) && value !== Number(row.precio)) stores.platillos.update(row.id, { precio: value });
                  }}
                />
              </label>
              <label className="flex items-center gap-1 text-sm text-muted">
                <input type="checkbox" checked={row.activo !== false} onChange={(event) => stores.platillos.update(row.id, { activo: event.target.checked })} />
                Activo
              </label>
              <span className="w-20 text-right text-sm">{money(row.precio)}</span>
            </li>
          ))}
        </ul>
      </section>

      <aside className="space-y-4">
        <section className={card} aria-label="Nuevo platillo">
          <h2 className="font-display text-lg font-bold">Nuevo platillo</h2>
          <div className="mt-3 space-y-2">
            <input aria-label="Nombre del platillo" className={input} placeholder="Nombre" value={nuevo.nombre} onChange={(event) => setNuevo({ ...nuevo, nombre: event.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <select aria-label="Categoría" className={input} value={nuevo.categoria} onChange={(event) => setNuevo({ ...nuevo, categoria: event.target.value })}>
                {categorias.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <input aria-label="Precio" className={input} inputMode="decimal" placeholder="Precio" value={nuevo.precio} onChange={(event) => setNuevo({ ...nuevo, precio: event.target.value })} />
            </div>
            <p className="pt-1 text-xs font-medium text-muted">Receta (se descuenta del inventario al mandar a cocina)</p>
            {receta.map((line, index) => (
              <div key={index} className="flex gap-2">
                <select aria-label="Insumo" className={input} value={line.insumo} onChange={(event) => setReceta(receta.map((item, position) => (position === index ? { ...item, insumo: event.target.value } : item)))}>
                  {insumos.map((row) => (
                    <option key={row.id} value={row.id}>
                      {String(row.nombre)}
                    </option>
                  ))}
                </select>
                <input aria-label="Cantidad por platillo" className={input + " w-24"} inputMode="decimal" value={String(line.cantidad)} onChange={(event) => setReceta(receta.map((item, position) => (position === index ? { ...item, cantidad: Number(event.target.value) || 0 } : item)))} />
                <button type="button" aria-label="Quitar insumo" className="p-1 text-muted" onClick={() => setReceta(receta.filter((_, position) => position !== index))}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button type="button" className={ghost + " w-full"} disabled={!insumos.length} onClick={() => setReceta([...receta, { insumo: insumos[0]?.id ?? "", cantidad: 0.1 }])}>
              <Plus size={14} /> Agregar insumo a la receta
            </button>
            <button type="button" className={primary + " w-full"} onClick={crearPlatillo}>
              Guardar platillo
            </button>
          </div>
        </section>
        <section className={card} aria-label="Nuevo insumo">
          <h2 className="font-display text-lg font-bold">Nuevo insumo</h2>
          <div className="mt-3 space-y-2">
            <input aria-label="Nombre del insumo" className={input} placeholder="Nombre" value={insumo.nombre} onChange={(event) => setInsumo({ ...insumo, nombre: event.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <select aria-label="Unidad" className={input} value={insumo.unidad} onChange={(event) => setInsumo({ ...insumo, unidad: event.target.value })}>
                {unidades.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <input aria-label="Mínimo" className={input} inputMode="decimal" placeholder="Mínimo" value={insumo.minimo} onChange={(event) => setInsumo({ ...insumo, minimo: event.target.value })} />
            </div>
            <button type="button" className={primary + " w-full"} onClick={crearInsumo}>
              Guardar insumo
            </button>
          </div>
        </section>
        {aviso ? (
          <p role="status" className="text-sm text-muted">
            {aviso}
          </p>
        ) : null}
      </aside>
    </div>
  );
}
`,
};
