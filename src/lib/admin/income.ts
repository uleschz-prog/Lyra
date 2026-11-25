/**
 * Ingresos de la empresa (panel admin → Ingresos).
 *
 * Fuentes:
 * - «pago»: asientos de `Transaction` que registran dinero recibido por la plataforma
 *   (CREDIT_PURCHASE = inscripción o upgrade; REBUY = recarga de créditos o recompra/mensualidad),
 *   pagados con Mercado Pago (externalRef «mp:…»), USDT TRC20 aprobado por admin («usdt:…» o
 *   «USDT TRC20» en la descripción), inscripción validada a mano por admin, o código promocional /
 *   de activación («promo:…», «code:…»; se listan como «sin cobro» y no suman).
 * - «manual»: `AdminIncomeEntry`, capturado por un admin (efectivo, transferencia, etc.).
 *
 * Editar el monto NUNCA cambia el pago original, créditos, wallet ni comisiones: se agrega una fila a
 * `AdminIncomeEdit` (monto anterior, nuevo, motivo, quién y cuándo) y los totales usan el monto vigente.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { zonedParts, zonedToUtc } from "@/lib/vega/schedule";

export const INCOME_TIMEZONE = "America/Mexico_City";

export const incomeTypes = ["inscripcion", "recarga", "recompra", "upgrade", "otro"] as const;
export type IncomeType = (typeof incomeTypes)[number];
export const incomeMethods = ["mercadopago", "usdt", "admin", "efectivo", "transferencia", "codigo", "otro"] as const;
export type IncomeMethod = (typeof incomeMethods)[number];
/** Métodos que un admin puede elegir al capturar un ingreso manual. */
export const manualMethods = ["efectivo", "transferencia", "usdt", "mercadopago", "otro"] as const satisfies readonly IncomeMethod[];
export const incomeCurrencies = ["USD", "MXN"] as const;
export type IncomeSource = "pago" | "manual";

export const typeLabel: Record<IncomeType, string> = {
  inscripcion: "Inscripción",
  recarga: "Recarga de créditos",
  recompra: "Recompra / mensualidad",
  upgrade: "Upgrade de plan",
  otro: "Otro",
};

export const methodLabel: Record<IncomeMethod, string> = {
  mercadopago: "Mercado Pago",
  usdt: "USDT TRC20",
  admin: "Validada por admin",
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  codigo: "Código (sin cobro)",
  otro: "Otro",
};

export type IncomeEditView = {
  id: string;
  previousAmount: number;
  newAmount: number;
  reason: string;
  editedByName: string;
  editedByEmail: string;
  createdAt: string;
};

export type IncomeRow = {
  /** «pago:<transactionId>» o «manual:<entryId>». */
  key: string;
  source: IncomeSource;
  id: string;
  at: string;
  userId: string | null;
  userName: string;
  userEmail: string;
  username: string | null;
  type: IncomeType;
  method: IncomeMethod;
  currency: string;
  originalAmount: number;
  /** Monto vigente: el último cambio o, si no hay, el original. */
  amount: number;
  edited: boolean;
  lastEdit: IncomeEditView | null;
  editCount: number;
  /** «pagado» suma en totales; «sin_cobro» (códigos) se lista pero no suma. */
  status: "pagado" | "sin_cobro";
  reference: string | null;
  description: string;
  note: string | null;
};

type Bucket = { total: number; count: number };
export type IncomeTotals = Record<string, { total: number; count: number; byType: Partial<Record<IncomeType, Bucket>>; byMethod: Partial<Record<IncomeMethod, Bucket>> }>;

export type IncomeFilters = {
  /** YYYY-MM-DD en hora de CDMX (inclusive). Vacío = sin límite. */
  from?: string;
  to?: string;
  type?: IncomeType | "";
  method?: IncomeMethod | "";
  source?: IncomeSource | "";
  userId?: string;
  q?: string;
  /** Incluir los «sin cobro» (códigos) en la lista. */
  includeUnpaid?: boolean;
};

export type IncomeDb = Pick<PrismaClient, "transaction" | "user" | "adminIncomeEntry" | "adminIncomeEdit">;

export type IncomeAdmin = { id: string; name: string; email: string };

const money = (value: unknown) => Math.round(Number(value ?? 0) * 100) / 100;

// ── Clasificación de los asientos de la plataforma ───────────────────────────────────────────────

export type TransactionLike = {
  kind: string;
  amount: unknown;
  reason: string | null;
  description: string;
  externalRef: string | null;
};

export function classifyTransaction(row: TransactionLike): { type: IncomeType; method: IncomeMethod; status: IncomeRow["status"]; reference: string | null } {
  const ref = row.externalRef?.trim() || null;
  const text = row.description ?? "";
  const reason = row.reason ?? "";

  let method: IncomeMethod = "otro";
  if (ref?.startsWith("mp:")) method = "mercadopago";
  else if (ref?.startsWith("usdt:") || /USDT/i.test(text)) method = "usdt";
  else if (ref?.startsWith("promo:") || ref?.startsWith("code:")) method = "codigo";
  else if (/validada por administración/i.test(text)) method = "admin";
  else if (/Mercado Pago/i.test(text)) method = "mercadopago";

  let type: IncomeType = "otro";
  if (row.kind === "CREDIT_PURCHASE") type = /^upgrade/i.test(text) ? "upgrade" : "inscripcion";
  else if (row.kind === "REBUY") {
    if (reason === "payments.credits" || reason === "admin.usdt.credits") type = "recarga";
    else if (reason === "payments.rebuy" || reason === "admin.usdt.rebuy") type = "recompra";
    else type = /^recarga/i.test(text) ? "recarga" : "recompra";
  }

  // Inscripción USDT validada antes de existir el externalRef: el TXID viene en la descripción.
  const txid = /USDT TRC20 · ([A-Za-z0-9]{16,})/.exec(text)?.[1] ?? null;
  return { type, method, status: method === "codigo" ? "sin_cobro" : "pagado", reference: ref ?? txid };
}

// ── Fechas (CDMX) ─────────────────────────────────────────────────────────────────────────────────

const dateRe = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIncomeDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = dateRe.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d && y >= 2020 && y <= 2100;
}

/** Inicio del día (CDMX) de una fecha YYYY-MM-DD, en UTC. */
export function dayStart(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return zonedToUtc(y, m, d, 0, 0, INCOME_TIMEZONE);
}

/** Inicio del día siguiente (límite exclusivo). */
export function dayEnd(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return zonedToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, INCOME_TIMEZONE);
}

export function todayIn(now: Date) {
  const p = zonedParts(now, INCOME_TIMEZONE);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function monthStartDate(now: Date) {
  return `${todayIn(now).slice(0, 8)}01`;
}

export function formatIncomeDate(iso: string) {
  return new Date(iso).toLocaleString("es-MX", { timeZone: INCOME_TIMEZONE, dateStyle: "medium", timeStyle: "short" });
}

// ── Carga ─────────────────────────────────────────────────────────────────────────────────────────

/** Máximo de filas por consulta (con más, se pide acotar las fechas). */
export const INCOME_LIMIT = 5000;

const incomeKinds = ["CREDIT_PURCHASE", "REBUY"] as const;

/** Lee pagos de la plataforma y capturas manuales en [since, until) con su monto vigente. */
export async function loadIncomeRows(db: IncomeDb, window: { since?: Date | null; until?: Date | null }): Promise<{ rows: IncomeRow[]; truncated: boolean }> {
  const range = {
    ...(window.since ? { gte: window.since } : {}),
    ...(window.until ? { lt: window.until } : {}),
  };
  const hasRange = Boolean(window.since || window.until);
  const [transactions, entries] = await Promise.all([
    db.transaction.findMany({
      where: { kind: { in: [...incomeKinds] }, amount: { gt: 0 }, ...(hasRange ? { createdAt: range } : {}) },
      orderBy: { createdAt: "desc" },
      take: INCOME_LIMIT + 1,
      select: { id: true, userId: true, amount: true, kind: true, reason: true, description: true, externalRef: true, createdAt: true },
    }),
    db.adminIncomeEntry.findMany({
      where: hasRange ? { receivedAt: range } : {},
      orderBy: { receivedAt: "desc" },
      take: INCOME_LIMIT + 1,
    }),
  ]);
  const truncated = transactions.length > INCOME_LIMIT || entries.length > INCOME_LIMIT;
  const txs = transactions.slice(0, INCOME_LIMIT);
  const manual = entries.slice(0, INCOME_LIMIT);

  const userIds = [...new Set([...txs.map((t) => t.userId), ...manual.flatMap((e) => (e.userId ? [e.userId] : []))])];
  const [users, edits] = await Promise.all([
    userIds.length
      ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true, username: true } })
      : Promise.resolve([]),
    txs.length || manual.length
      ? db.adminIncomeEdit.findMany({
          where: {
            OR: [
              ...(txs.length ? [{ transactionId: { in: txs.map((t) => t.id) } }] : []),
              ...(manual.length ? [{ entryId: { in: manual.map((e) => e.id) } }] : []),
            ],
          },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const editsByKey = new Map<string, typeof edits>();
  for (const edit of edits) {
    const key = edit.transactionId ? `pago:${edit.transactionId}` : `manual:${edit.entryId}`;
    editsByKey.set(key, [...(editsByKey.get(key) ?? []), edit]);
  }
  const lastEditOf = (key: string) => {
    const list = editsByKey.get(key) ?? [];
    const last = list[list.length - 1];
    return {
      count: list.length,
      last: last
        ? {
            id: last.id,
            previousAmount: money(last.previousAmount),
            newAmount: money(last.newAmount),
            reason: last.reason,
            editedByName: last.editedByName,
            editedByEmail: last.editedByEmail,
            createdAt: last.createdAt.toISOString(),
          }
        : null,
    };
  };

  const rows: IncomeRow[] = [];
  for (const tx of txs) {
    const key = `pago:${tx.id}`;
    const user = userById.get(tx.userId);
    const info = classifyTransaction(tx);
    const edit = lastEditOf(key);
    const original = money(tx.amount);
    rows.push({
      key,
      source: "pago",
      id: tx.id,
      at: tx.createdAt.toISOString(),
      userId: tx.userId,
      userName: user?.name ?? "Cuenta borrada",
      userEmail: user?.email ?? "",
      username: user?.username ?? null,
      type: info.type,
      method: info.method,
      currency: "USD",
      originalAmount: original,
      amount: edit.last ? edit.last.newAmount : original,
      edited: Boolean(edit.last),
      lastEdit: edit.last,
      editCount: edit.count,
      status: info.status,
      reference: info.reference,
      description: tx.description,
      note: null,
    });
  }
  for (const entry of manual) {
    const key = `manual:${entry.id}`;
    const user = entry.userId ? userById.get(entry.userId) : undefined;
    const edit = lastEditOf(key);
    const original = money(entry.amount);
    rows.push({
      key,
      source: "manual",
      id: entry.id,
      at: entry.receivedAt.toISOString(),
      userId: entry.userId,
      userName: user?.name ?? entry.userName,
      userEmail: user?.email ?? entry.userEmail,
      username: user?.username ?? null,
      type: (incomeTypes as readonly string[]).includes(entry.type) ? (entry.type as IncomeType) : "otro",
      method: (incomeMethods as readonly string[]).includes(entry.method) ? (entry.method as IncomeMethod) : "otro",
      currency: entry.currency,
      originalAmount: original,
      amount: edit.last ? edit.last.newAmount : original,
      edited: Boolean(edit.last),
      lastEdit: edit.last,
      editCount: edit.count,
      status: "pagado",
      reference: entry.reference,
      description: `Captura manual de ${entry.createdByName}`,
      note: entry.note,
    });
  }
  rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return { rows, truncated };
}

// ── Filtros y totales ─────────────────────────────────────────────────────────────────────────────

function fold(text: string) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function filterIncome(rows: IncomeRow[], filters: IncomeFilters): IncomeRow[] {
  const since = filters.from && isIncomeDate(filters.from) ? dayStart(filters.from).getTime() : null;
  const until = filters.to && isIncomeDate(filters.to) ? dayEnd(filters.to).getTime() : null;
  const q = filters.q ? fold(filters.q.trim()) : "";
  return rows.filter((row) => {
    const at = Date.parse(row.at);
    if (since !== null && at < since) return false;
    if (until !== null && at >= until) return false;
    if (filters.type && row.type !== filters.type) return false;
    if (filters.method && row.method !== filters.method) return false;
    if (filters.source && row.source !== filters.source) return false;
    if (filters.userId && row.userId !== filters.userId) return false;
    if (!filters.includeUnpaid && row.status === "sin_cobro" && filters.method !== "codigo") return false;
    if (q) {
      const haystack = fold([row.userName, row.userEmail, row.username ?? "", row.userId ?? "", row.reference ?? "", row.description, row.note ?? "", row.id].join(" "));
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function sumIncome(rows: IncomeRow[]): IncomeTotals {
  const totals: IncomeTotals = {};
  for (const row of rows) {
    if (row.status !== "pagado") continue;
    const bucket = (totals[row.currency] ??= { total: 0, count: 0, byType: {}, byMethod: {} });
    bucket.total = money(bucket.total + row.amount);
    bucket.count += 1;
    const type = (bucket.byType[row.type] ??= { total: 0, count: 0 });
    type.total = money(type.total + row.amount);
    type.count += 1;
    const method = (bucket.byMethod[row.method] ??= { total: 0, count: 0 });
    method.total = money(method.total + row.amount);
    method.count += 1;
  }
  return totals;
}

export type IncomeReport = {
  rows: IncomeRow[];
  totals: { today: IncomeTotals; month: IncomeTotals; range: IncomeTotals };
  filters: IncomeFilters;
  today: string;
  monthStart: string;
  truncated: boolean;
};

/** Normaliza filtros que llegan de la URL (lo inválido se ignora). Sin fechas = mes en curso. */
export function parseIncomeFilters(params: URLSearchParams, now: Date): IncomeFilters {
  const pick = <T extends string>(value: string | null, allowed: readonly T[]) => (value && (allowed as readonly string[]).includes(value) ? (value as T) : "");
  const all = params.get("todo") === "1";
  const from = params.get("desde");
  const to = params.get("hasta");
  return {
    from: isIncomeDate(from) ? from : all ? "" : monthStartDate(now),
    to: isIncomeDate(to) ? to : "",
    type: pick(params.get("tipo"), incomeTypes),
    method: pick(params.get("metodo"), incomeMethods),
    source: pick(params.get("origen"), ["pago", "manual"] as const),
    userId: (params.get("usuario") ?? "").trim().slice(0, 64) || undefined,
    q: (params.get("q") ?? "").trim().slice(0, 120) || undefined,
    includeUnpaid: params.get("sinCobro") === "1",
  };
}

export async function incomeReport(db: IncomeDb, filters: IncomeFilters, now: Date): Promise<IncomeReport> {
  const today = todayIn(now);
  const monthStart = monthStartDate(now);
  // Se carga lo que piden los filtros más el mes en curso (para «hoy» y «este mes»).
  const fromDate = filters.from && isIncomeDate(filters.from) ? filters.from : null;
  const since = fromDate ? dayStart(fromDate < monthStart ? fromDate : monthStart) : null;
  const { rows: loaded, truncated } = await loadIncomeRows(db, { since });
  const rows = filterIncome(loaded, filters);
  const paidOnly = (list: IncomeRow[]) => list.filter((row) => row.status === "pagado");
  const base = { includeUnpaid: false };
  return {
    rows,
    totals: {
      today: sumIncome(paidOnly(filterIncome(loaded, { ...base, from: today, to: today }))),
      month: sumIncome(paidOnly(filterIncome(loaded, { ...base, from: monthStart, to: today }))),
      range: sumIncome(rows),
    },
    filters,
    today,
    monthStart,
    truncated,
  };
}

// ── Edición con bitácora ──────────────────────────────────────────────────────────────────────────

export const MAX_INCOME_AMOUNT = 10_000_000;

export function parseAmount(value: unknown): number | null {
  const raw = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[$,\s]/g, "")) : NaN;
  if (!Number.isFinite(raw) || raw < 0 || raw > MAX_INCOME_AMOUNT) return null;
  // Máximo dos decimales.
  if (Math.abs(Math.round(raw * 100) - raw * 100) > 1e-6) return null;
  return Math.round(raw * 100) / 100;
}

type Result<T> = ({ ok: true } & T) | { ok: false; status: number; error: string };

export function parseIncomeKey(key: string): { source: IncomeSource; id: string } | null {
  const match = /^(pago|manual):([A-Za-z0-9_-]{1,64})$/.exec(key);
  return match ? { source: match[1] as IncomeSource, id: match[2] } : null;
}

/** Cambia el monto vigente de un ingreso. Solo agrega a la bitácora; no toca el pago, créditos ni comisiones. */
export async function editIncomeAmount(
  db: IncomeDb,
  admin: IncomeAdmin,
  input: { key: string; amount: unknown; reason: unknown },
): Promise<Result<{ edit: IncomeEditView; originalAmount: number }>> {
  const target = parseIncomeKey(input.key);
  if (!target) return { ok: false, status: 400, error: "Ese ingreso no existe." };
  const amount = parseAmount(input.amount);
  if (amount === null) return { ok: false, status: 400, error: "Escribe una cantidad válida (0 o más, hasta 2 decimales)." };
  const reason = typeof input.reason === "string" ? input.reason.trim().replace(/\s+/g, " ") : "";
  if (reason.length < 3 || reason.length > 500) return { ok: false, status: 400, error: "Escribe el motivo del cambio (de 3 a 500 caracteres)." };

  let originalAmount: number;
  if (target.source === "pago") {
    const tx = await db.transaction.findUnique({ where: { id: target.id }, select: { id: true, amount: true, kind: true } });
    if (!tx || !(incomeKinds as readonly string[]).includes(tx.kind) || money(tx.amount) <= 0) return { ok: false, status: 404, error: "Ese ingreso no existe." };
    originalAmount = money(tx.amount);
  } else {
    const entry = await db.adminIncomeEntry.findUnique({ where: { id: target.id }, select: { id: true, amount: true } });
    if (!entry) return { ok: false, status: 404, error: "Ese ingreso no existe." };
    originalAmount = money(entry.amount);
  }

  const [last] = await db.adminIncomeEdit.findMany({
    where: target.source === "pago" ? { transactionId: target.id } : { entryId: target.id },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { newAmount: true },
  });
  const previousAmount = last ? money(last.newAmount) : originalAmount;
  if (previousAmount === amount) return { ok: false, status: 400, error: "Esa ya es la cantidad registrada." };

  const created = await db.adminIncomeEdit.create({
    data: {
      source: target.source,
      transactionId: target.source === "pago" ? target.id : null,
      entryId: target.source === "manual" ? target.id : null,
      originalAmount,
      previousAmount,
      newAmount: amount,
      reason,
      editedById: admin.id,
      editedByName: admin.name,
      editedByEmail: admin.email,
    },
  });
  return {
    ok: true,
    originalAmount,
    edit: {
      id: created.id,
      previousAmount,
      newAmount: amount,
      reason,
      editedByName: admin.name,
      editedByEmail: admin.email,
      createdAt: created.createdAt.toISOString(),
    },
  };
}

export async function incomeHistory(db: IncomeDb, key: string): Promise<IncomeEditView[] | null> {
  const target = parseIncomeKey(key);
  if (!target) return null;
  const edits = await db.adminIncomeEdit.findMany({
    where: target.source === "pago" ? { transactionId: target.id } : { entryId: target.id },
    orderBy: { createdAt: "desc" },
  });
  return edits.map((edit) => ({
    id: edit.id,
    previousAmount: money(edit.previousAmount),
    newAmount: money(edit.newAmount),
    reason: edit.reason,
    editedByName: edit.editedByName,
    editedByEmail: edit.editedByEmail,
    createdAt: edit.createdAt.toISOString(),
  }));
}

// ── Captura manual ────────────────────────────────────────────────────────────────────────────────

/** Registra dinero recibido fuera de la plataforma. No acredita créditos ni paga comisiones. */
export async function addManualIncome(
  db: IncomeDb,
  admin: IncomeAdmin,
  input: Record<string, unknown>,
  now: Date,
): Promise<Result<{ id: string }>> {
  const who = typeof input.user === "string" ? input.user.trim() : "";
  if (!who) return { ok: false, status: 400, error: "Indica el socio (correo, usuario o ID)." };
  const user = await db.user.findFirst({
    where: { OR: [{ id: who }, { email: who.toLowerCase() }, { username: who.replace(/^@/, "") }] },
    select: { id: true, name: true, email: true },
  });
  if (!user) return { ok: false, status: 404, error: "No encontramos a ese socio. Usa su correo, usuario o ID." };

  const type = typeof input.type === "string" && (incomeTypes as readonly string[]).includes(input.type) ? (input.type as IncomeType) : null;
  if (!type) return { ok: false, status: 400, error: "Elige el tipo de ingreso." };
  const method = typeof input.method === "string" && (manualMethods as readonly string[]).includes(input.method) ? input.method : null;
  if (!method) return { ok: false, status: 400, error: "Elige el método de pago." };
  const currency = typeof input.currency === "string" && (incomeCurrencies as readonly string[]).includes(input.currency) ? input.currency : null;
  if (!currency) return { ok: false, status: 400, error: "Elige la moneda (USD o MXN)." };
  const amount = parseAmount(input.amount);
  if (amount === null || amount <= 0) return { ok: false, status: 400, error: "Escribe una cantidad mayor a 0 (hasta 2 decimales)." };

  const today = todayIn(now);
  const date = typeof input.date === "string" && input.date ? input.date : today;
  if (!isIncomeDate(date) || date > today) return { ok: false, status: 400, error: "La fecha no es válida (no puede ser futura)." };
  // Hoy = la hora actual; días anteriores = mediodía CDMX (para que caiga en el día correcto).
  const receivedAt = date === today ? now : new Date(dayStart(date).getTime() + 12 * 3_600_000);
  const reference = typeof input.reference === "string" ? input.reference.trim().slice(0, 120) || null : null;
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 1000) || null : null;

  const created = await db.adminIncomeEntry.create({
    data: {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      type,
      method,
      currency,
      amount,
      receivedAt,
      reference,
      note,
      createdById: admin.id,
      createdByName: admin.name,
    },
    select: { id: true },
  });
  return { ok: true, id: created.id };
}

// ── CSV ───────────────────────────────────────────────────────────────────────────────────────────

function cell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  // Evita fórmulas al abrir en Excel/Sheets.
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function incomeCsv(rows: IncomeRow[]) {
  const header = [
    "Fecha (CDMX)",
    "Socio",
    "Correo",
    "Usuario",
    "ID del socio",
    "Tipo",
    "Método",
    "Moneda",
    "Monto vigente",
    "Monto original",
    "Editado",
    "Motivo del último cambio",
    "Editado por",
    "Estado",
    "Referencia",
    "Origen",
    "Descripción",
    "ID del ingreso",
  ];
  const lines = rows.map((row) => [
    formatIncomeDate(row.at),
    row.userName,
    row.userEmail,
    row.username ?? "",
    row.userId ?? "",
    typeLabel[row.type],
    methodLabel[row.method],
    row.currency,
    row.amount.toFixed(2),
    row.originalAmount.toFixed(2),
    row.edited ? "Sí" : "No",
    row.lastEdit?.reason ?? "",
    row.lastEdit ? `${row.lastEdit.editedByName} · ${formatIncomeDate(row.lastEdit.createdAt)}` : "",
    row.status === "pagado" ? "Pagado" : "Sin cobro (código)",
    row.reference ?? "",
    row.source === "pago" ? "Plataforma" : "Captura manual",
    row.description,
    row.key,
  ]);
  return `\uFEFF${[header, ...lines].map((line) => line.map(cell).join(",")).join("\r\n")}\r\n`;
}
