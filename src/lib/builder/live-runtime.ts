// Datos en vivo dentro de la app generada (archivos del andamiaje, confiables: el modelo no los
// escribe). Sin configuración (vista previa, otro hosting) la app trabaja local con datos de
// ejemplo. En /s/[slug] con datos en vivo activos, LYRA inyecta window.__LYRA_DATA__ y la app
// pide PIN, baja los datos de su sucursal y sincroniza cada pocos segundos con la Data API.
import type { BuildPlan } from "@/lib/builder/types";

export type LiveRuntimeInput = { roles: { key: string; label: string }[]; branches: { id: string; name: string }[] };

export function liveInputFromPlan(plan: Pick<BuildPlan, "live">): LiveRuntimeInput {
  const roles = plan.live?.roles ?? [];
  return {
    roles: [{ key: "admin", label: "Administración" }, ...roles.filter((role) => role.key !== "admin")],
    branches: plan.live?.branches ?? [],
  };
}

export function liveSource(input: LiveRuntimeInput) {
  return `// Motor de datos en vivo. Sin window.__LYRA_DATA__ todo queda local (vista previa).
import { useSyncExternalStore } from "react";

export type LiveBranch = { id: string; name: string };
export type LiveRole = { key: string; label: string };
export type LiveMember = { id: string; name: string; role: string; branchId: string | null };
export type LiveStatus = "local" | "paused" | "login" | "loading" | "online" | "offline";
export type LiveState = {
  status: LiveStatus;
  title: string;
  member: LiveMember | null;
  roles: LiveRole[];
  branches: LiveBranch[];
  /** Sucursal en pantalla (null = todas, solo administración). */
  branch: string | null;
  pending: number;
  error: string | null;
};
type LiveConfig = { api: string; slug: string; status: string };
type ServerRow = { id: string; c: string; b: string | null; v: number; s: number; d: Record<string, unknown>; x: boolean; ca: string; ua: string };
export type LiveOp =
  | { op: "create"; c: string; id: string; data: Record<string, unknown>; branch?: string | null }
  | { op: "update"; c: string; id: string; data: Record<string, unknown> }
  | { op: "inc"; c: string; id: string; field: string; by: number }
  | { op: "delete"; c: string; id: string };
export type LiveRow = { id: string; createdAt: string; updatedAt: string; branchId: string | null; [key: string]: unknown };

export const appRoles: LiveRole[] = ${JSON.stringify(input.roles)};
export const appBranches: LiveBranch[] = ${JSON.stringify(input.branches)};

export function liveConfig(): LiveConfig | null {
  const raw = typeof window === "undefined" ? undefined : (window as unknown as { __LYRA_DATA__?: Partial<LiveConfig> }).__LYRA_DATA__;
  return raw && typeof raw.api === "string" && typeof raw.slug === "string" ? { api: raw.api, slug: raw.slug, status: String(raw.status ?? "active") } : null;
}

const config = liveConfig();
let token: string | null = null;
let cursor = 0;
let state: LiveState = config
  ? { status: config.status === "active" ? "login" : "paused", title: "", member: null, roles: appRoles, branches: appBranches, branch: null, pending: 0, error: null }
  : { status: "local", title: "", member: { id: "demo", name: "Vista previa", role: "admin", branchId: null }, roles: appRoles, branches: appBranches, branch: appBranches[0]?.id ?? null, pending: 0, error: null };
const stateListeners = new Set<() => void>();

function setState(patch: Partial<LiveState>) {
  state = { ...state, ...patch };
  stateListeners.forEach((listener) => listener());
}

export function getLive() {
  return state;
}

export function subscribeLive(listener: () => void) {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

export function useLive() {
  return useSyncExternalStore(subscribeLive, getLive, getLive);
}

export const isLive = config !== null;

/** Sucursal para un registro nuevo: la de la persona, la que está en pantalla o la primera. */
export function writeBranch() {
  return state.member?.branchId ?? state.branch ?? state.branches[0]?.id ?? null;
}

/** Administración elige la sucursal en pantalla (null = todas). Las demás personas ven la suya. */
export function setBranch(branch: string | null) {
  if (state.member?.role !== "admin" && state.status !== "local") return;
  setState({ branch: branch && state.branches.some((item) => item.id === branch) ? branch : null });
}

/** Solo en la vista previa: ver la app como otro rol o sucursal. */
export function previewAs(role: string, branchId: string | null = null) {
  if (state.status !== "local") return;
  const label = state.roles.find((item) => item.key === role)?.label ?? role;
  setState({ member: { id: "demo", name: label, role, branchId }, branch: branchId ?? state.branch ?? state.branches[0]?.id ?? null });
}

/* ------------------------------ Datos ------------------------------ */

const base = new Map<string, Map<string, ServerRow>>();
let queue: LiveOp[][] = [];
let batching: LiveOp[] | null = null;
const listeners = new Map<string, Set<() => void>>();
const views = new Map<string, LiveRow[]>();

function table(collection: string) {
  let rows = base.get(collection);
  if (!rows) base.set(collection, (rows = new Map()));
  return rows;
}

function changed(collections: Iterable<string>) {
  for (const collection of new Set(collections)) {
    views.delete(collection);
    listeners.get(collection)?.forEach((listener) => listener());
  }
}

function changedAll() {
  changed([...listeners.keys(), ...views.keys()]);
}

function applyOp(rows: Map<string, LiveRow>, op: LiveOp) {
  const now = new Date().toISOString();
  const current = rows.get(op.id);
  if (op.op === "create") rows.set(op.id, { ...op.data, id: op.id, createdAt: now, updatedAt: now, branchId: op.branch ?? null });
  else if (op.op === "update" && current) rows.set(op.id, { ...current, ...op.data, id: op.id, updatedAt: now });
  else if (op.op === "inc" && current) rows.set(op.id, { ...current, [op.field]: (Number(current[op.field]) || 0) + op.by, updatedAt: now });
  else if (op.op === "delete") rows.delete(op.id);
}

/** Lo que ve la pantalla: lo confirmado por el servidor más los cambios aún en camino. */
export function liveRows(collection: string): LiveRow[] {
  const cached = views.get(collection);
  if (cached) return cached;
  const rows = new Map<string, LiveRow>();
  for (const row of table(collection).values()) if (!row.x) rows.set(row.id, { ...row.d, id: row.id, createdAt: row.ca, updatedAt: row.ua, branchId: row.b });
  for (const ops of [...queue, ...(batching ? [batching] : [])]) for (const op of ops) if (op.c === collection) applyOp(rows, op);
  const list = [...rows.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  views.set(collection, list);
  return list;
}

export function subscribeRows(collection: string, listener: () => void) {
  let set = listeners.get(collection);
  if (!set) listeners.set(collection, (set = new Set()));
  set.add(listener);
  return () => {
    set!.delete(listener);
  };
}

export function liveWrite(op: LiveOp) {
  if (batching) {
    batching.push(op);
    changed([op.c]);
    return;
  }
  enqueue([op]);
}

/**
 * Varios cambios que deben guardarse juntos (p. ej. mandar una comanda y descontar inventario):
 * o entran todos o ninguno.
 */
export function transact(run: () => void) {
  if (!config || batching) {
    run();
    return;
  }
  batching = [];
  try {
    run();
  } finally {
    const ops = batching;
    batching = null;
    if (ops.length) enqueue(ops);
  }
}

function enqueue(ops: LiveOp[]) {
  queue.push(ops);
  changed(ops.map((op) => op.c));
  setState({ pending: queue.length });
  void flush();
}

function merge(rows: ServerRow[]) {
  const touched: string[] = [];
  for (const row of rows) {
    const rowsOf = table(row.c);
    const current = rowsOf.get(row.id);
    if (current && current.s > row.s) continue;
    if (row.x) rowsOf.delete(row.id);
    else rowsOf.set(row.id, row);
    touched.push(row.c);
  }
  changed(touched);
}

/* ------------------------------ Red ------------------------------ */

type Reply = { network: true } | { network: false; status: number; body: Record<string, unknown> };

async function call(action: string, init: { method?: "GET" | "POST"; body?: unknown; query?: string } = {}): Promise<Reply> {
  if (!config) return { network: true };
  try {
    const response = await fetch(config.api + action + (init.query ?? ""), {
      method: init.method ?? "GET",
      headers: token ? { Authorization: "Bearer " + token, "Content-Type": "text/plain" } : { "Content-Type": "text/plain" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      credentials: "omit",
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { network: false, status: response.status, body };
  } catch {
    return { network: true };
  }
}

function expired(message = "Tu sesión terminó. Ingresa tu PIN.") {
  token = null;
  stopPolling();
  setState({ status: "login", error: message });
}

let flushing = false;
let retry: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  if (flushing || !token) return;
  flushing = true;
  let resync = false;
  try {
    while (queue.length && token) {
      const ops = queue[0];
      const reply = await call("batch", { method: "POST", body: { ops } });
      if (reply.network) {
        setState({ status: "offline" });
        if (!retry) retry = setTimeout(() => ((retry = null), void flush()), 3000);
        return;
      }
      if (reply.status === 401) return expired();
      queue = queue.slice(1);
      if (reply.status === 200 && reply.body.ok) merge((reply.body.records as ServerRow[]) ?? []);
      else {
        resync = true;
        setState({ error: String(reply.body.error ?? "No se pudo guardar un cambio.") });
      }
      changed(ops.map((op) => op.c));
      setState({ pending: queue.length, status: "online" });
    }
  } finally {
    flushing = false;
  }
  if (resync) await pull(true);
}

let pulling = false;

/** Baja los cambios desde el último número de cambio (o todo, con reset). */
export async function pull(reset = false) {
  if (!token || (pulling && !reset)) return;
  pulling = true;
  try {
    if (reset) cursor = 0;
    for (let page = 0; page < 40; page += 1) {
      const reply = await call("changes", { query: "?since=" + cursor });
      if (reply.network) return setState({ status: "offline" });
      if (reply.status === 401) return expired();
      if (reply.status !== 200) return setState({ error: String(reply.body.error ?? "No pudimos leer los datos.") });
      if (reply.body.reset) {
        base.clear();
        changedAll();
      }
      merge((reply.body.records as ServerRow[]) ?? []);
      cursor = Number(reply.body.seq) || cursor;
      if (!reply.body.more) break;
    }
    if (state.status !== "online") setState({ status: "online" });
  } finally {
    pulling = false;
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;

function startPolling() {
  stopPolling();
  const tick = async () => {
    await pull();
    if (queue.length) await flush();
    const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    timer = setTimeout(tick, hidden ? 15000 : 2500);
  };
  timer = setTimeout(tick, 2500);
}

function stopPolling() {
  if (timer) clearTimeout(timer);
  timer = null;
}

type SessionReply = { app: { title: string }; member: LiveMember; roles: LiveRole[]; branches: LiveBranch[] };

export async function loginWithPin(pin: string): Promise<{ ok: boolean; error?: string }> {
  if (!config) return { ok: false, error: "Esta app no tiene datos en vivo." };
  const reply = await call("login", { method: "POST", body: { pin } });
  if (reply.network) return { ok: false, error: "Sin conexión. Revisa tu internet." };
  if (reply.status !== 200 || typeof reply.body.token !== "string") return { ok: false, error: String(reply.body.error ?? "PIN incorrecto.") };
  token = reply.body.token;
  const session = reply.body.session as SessionReply;
  const branches = Array.isArray(session.branches) && session.branches.length ? session.branches : appBranches;
  const keep = state.branch && branches.some((item) => item.id === state.branch) ? state.branch : null;
  setState({
    status: "loading",
    error: null,
    title: session.app?.title ?? "",
    member: session.member,
    roles: Array.isArray(session.roles) && session.roles.length ? session.roles : appRoles,
    branches,
    branch: session.member.branchId ?? keep ?? branches[0]?.id ?? null,
  });
  await pull(true);
  if (!token) return { ok: false, error: state.error ?? "No pudimos entrar." };
  startPolling();
  void flush();
  return { ok: true };
}

export async function logout() {
  if (token) await call("logout", { method: "POST", body: {} });
  token = null;
  stopPolling();
  base.clear();
  queue = [];
  changedAll();
  setState({ status: config ? "login" : "local", member: null, pending: 0, error: null });
}

export function clearLiveError() {
  setState({ error: null });
}

export function newId() {
  const random = Array.from(crypto.getRandomValues(new Uint8Array(9)), (byte) => (byte % 36).toString(36)).join("");
  return Date.now().toString(36) + random;
}
`;
}

export const liveGateSource = `// Entrada con PIN, estado de conexión y selector de sucursal (datos en vivo).
import { useEffect, useState, type ReactNode } from "react";

import { clearLiveError, loginWithPin, logout, setBranch, useLive } from "../lib/live";

function PinPad() {
  const live = useLive();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(value: string) {
    if (busy || value.length !== 6) return;
    setBusy(true);
    setError(null);
    const result = await loginWithPin(value);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "PIN incorrecto.");
      setPin("");
    }
  }

  function press(key: string) {
    clearLiveError();
    if (busy) return;
    if (key === "del") return setPin(pin.slice(0, -1));
    const next = (pin + key).slice(0, 6);
    setPin(next);
    if (next.length === 6) void submit(next);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (/^[0-9]$/.test(event.key)) press(event.key);
      else if (event.key === "Backspace") press("del");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const message = error ?? live.error;
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-6">
      <div className="w-full max-w-xs rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-6 text-center shadow-[var(--shadow-card)]">
        <h1 className="text-xl font-semibold text-[var(--color-ink)]">{document.title || "Entrar"}</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Ingresa tu PIN de 6 dígitos</p>
        <div className="my-5 flex justify-center gap-2" aria-label="PIN" data-testid="pin-dots">
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} className={"h-3 w-3 rounded-full " + (index < pin.length ? "bg-[var(--color-primary)]" : "bg-[var(--color-line)]")} />
          ))}
        </div>
        {message ? <p role="alert" className="mb-3 text-sm text-red-600">{message}</p> : null}
        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0"].map((key) => (
            <button
              key={key}
              type="button"
              disabled={busy}
              onClick={() => press(key)}
              className="h-14 rounded-[var(--radius-btn)] bg-[var(--color-surface-2)] text-lg font-semibold text-[var(--color-ink)] active:scale-95 disabled:opacity-50"
            >
              {key === "del" ? "⌫" : key}
            </button>
          ))}
          <button type="button" disabled={busy || pin.length !== 6} onClick={() => void submit(pin)} className="h-14 rounded-[var(--radius-btn)] bg-[var(--color-primary)] text-sm font-semibold text-[var(--color-primary-ink)] disabled:opacity-40">
            {busy ? "…" : "Entrar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Selector de sucursal: administración elige; las demás personas ven el nombre de la suya. */
export function BranchSwitcher({ className = "" }: { className?: string }) {
  const live = useLive();
  if (!live.branches.length) return null;
  const fixed = live.member?.role !== "admin" && live.status !== "local";
  if (fixed) {
    const name = live.branches.find((item) => item.id === live.member?.branchId)?.name;
    return name ? <span className={"text-sm font-medium " + className}>{name}</span> : null;
  }
  return (
    <select
      aria-label="Sucursal"
      value={live.branch ?? ""}
      onChange={(event) => setBranch(event.target.value || null)}
      className={"rounded-[var(--radius-input)] border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-sm text-[var(--color-ink)] " + className}
    >
      {live.member?.role === "admin" ? <option value="">Todas las sucursales</option> : null}
      {live.branches.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </select>
  );
}

function StatusPill() {
  const live = useLive();
  if (live.status === "local") return null;
  const online = live.status === "online";
  return (
    <div className="fixed bottom-3 left-3 z-[2147483646] flex items-center gap-2 rounded-full bg-black/80 px-3 py-1.5 text-xs text-white shadow-lg" data-testid="live-status">
      <span className={"h-2 w-2 rounded-full " + (online ? "bg-emerald-400" : "bg-amber-400")} />
      <span>{online ? (live.pending ? "Guardando…" : "En línea") : "Sin conexión"}</span>
      {live.member ? <span className="opacity-70">· {live.member.name}</span> : null}
      <button type="button" onClick={() => void logout()} className="ml-1 rounded-full bg-white/15 px-2 py-0.5">
        Salir
      </button>
      {live.error ? (
        <button type="button" onClick={clearLiveError} className="ml-1 max-w-[220px] truncate text-amber-300" title={live.error}>
          {live.error}
        </button>
      ) : null}
    </div>
  );
}

export default function LiveGate({ children }: { children: ReactNode }) {
  const live = useLive();
  if (live.status === "paused")
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-[var(--color-muted)]">
        <p>Esta app está en pausa. Pide a la persona administradora que la reactive desde LYRA.</p>
      </div>
    );
  if (live.status === "login") return <PinPad />;
  if (live.status === "loading")
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--color-muted)]">
        <p>Cargando datos…</p>
      </div>
    );
  return (
    <>
      {children}
      <StatusPill />
    </>
  );
}
`;
