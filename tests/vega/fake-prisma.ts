/** Base de datos en memoria para probar consultas simples de Prisma (sin Postgres). */

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

function num(value: unknown) {
  return value instanceof Date ? value.getTime() : Number(value);
}

function matchValue(value: unknown, condition: unknown): boolean {
  if (condition && typeof condition === "object" && !(condition instanceof Date)) {
    const spec = condition as Record<string, unknown>;
    return Object.entries(spec).every(([op, target]) => {
      if (op === "mode") return true;
      if (op === "gt") return value != null && num(value) > num(target);
      if (op === "gte") return value != null && num(value) >= num(target);
      if (op === "lt") return value != null && num(value) < num(target);
      if (op === "lte") return value != null && num(value) <= num(target);
      if (op === "in") return (target as unknown[]).includes(value);
      if (op === "notIn") return !(target as unknown[]).includes(value);
      if (op === "not") return !matchValue(value, target);
      if (op === "contains") {
        const needle = String(target);
        return spec.mode === "insensitive" ? String(value).toLowerCase().includes(needle.toLowerCase()) : String(value).includes(needle);
      }
      if (op === "equals") {
        return spec.mode === "insensitive" ? String(value).toLowerCase() === String(target).toLowerCase() : value === target;
      }
      return false;
    });
  }
  if (condition === null) return value === null || value === undefined;
  if (condition instanceof Date) return value instanceof Date && value.getTime() === condition.getTime();
  return value === condition;
}

export function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") return (condition as Where[]).some((part) => matches(row, part));
    if (key === "AND") return (condition as Where[]).every((part) => matches(row, part));
    return matchValue(row[key], condition);
  });
}

function pick(row: Row, select?: Record<string, boolean>) {
  if (!select) return { ...row };
  return Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, row[key]]));
}

function sortRows(rows: Row[], orderBy?: Record<string, "asc" | "desc"> | Record<string, "asc" | "desc">[]) {
  const orders = orderBy ? (Array.isArray(orderBy) ? orderBy : [orderBy]) : [];
  return [...rows].sort((left, right) => {
    for (const order of orders) {
      const [key, direction] = Object.entries(order)[0];
      const a = left[key] instanceof Date ? (left[key] as Date).getTime() : (left[key] as number | string);
      const b = right[key] instanceof Date ? (right[key] as Date).getTime() : (right[key] as number | string);
      if (a === b) continue;
      return (a < b ? -1 : 1) * (direction === "desc" ? -1 : 1);
    }
    return 0;
  });
}

let counter = 0;
let clock = Date.parse("2026-11-01T00:00:00Z");
export function tick() {
  clock += 1000;
  return new Date(clock);
}

function apply(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && !(value instanceof Date) && "increment" in (value as Row)) {
      row[key] = Number(row[key] ?? 0) + Number((value as Row).increment);
    } else {
      row[key] = value;
    }
  }
}

/** `unique`: columnas que juntas son únicas (simula P2002 de Postgres). */
export function table(defaults: (data: Row) => Row = () => ({}), options: { unique?: string[] } = {}) {
  const rows: Row[] = [];
  return {
    rows,
    async findMany(args: { where?: Where; select?: Record<string, boolean>; orderBy?: never; take?: number } = {}) {
      const found = sortRows(rows.filter((row) => matches(row, args.where)), args.orderBy);
      return found.slice(0, args.take ?? found.length).map((row) => pick(row, args.select));
    },
    async findFirst(args: { where?: Where; select?: Record<string, boolean> } = {}) {
      const row = rows.find((candidate) => matches(candidate, args.where));
      return row ? pick(row, args.select) : null;
    },
    async findUnique(args: { where: Where; select?: Record<string, boolean> }) {
      const row = rows.find((candidate) => matches(candidate, args.where));
      return row ? pick(row, args.select) : null;
    },
    async aggregate(args: { where?: Where; _sum?: Record<string, boolean> } = {}) {
      const found = rows.filter((row) => matches(row, args.where));
      const sum = Object.fromEntries(
        Object.keys(args._sum ?? {}).map((key) => [key, found.length ? found.reduce((total, row) => total + Number(row[key] ?? 0), 0) : null]),
      );
      return { _sum: sum };
    },
    async count(args: { where?: Where } = {}) {
      return rows.filter((row) => matches(row, args.where)).length;
    },
    async create(args: { data: Row; select?: Record<string, boolean> }) {
      const now = tick();
      const row: Row = { id: `id${(counter += 1)}`, createdAt: now, updatedAt: now, ...defaults(args.data), ...args.data };
      const unique = options.unique;
      const same = (a: unknown, b: unknown) => (a instanceof Date || b instanceof Date ? num(a) === num(b) : a === b);
      if (unique && rows.some((other) => unique.every((key) => same(other[key], row[key])))) {
        throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      }
      rows.push(row);
      return pick(row, args.select);
    },
    async update(args: { where: Where; data: Row; select?: Record<string, boolean> }) {
      const row = rows.find((candidate) => matches(candidate, args.where));
      if (!row) throw new Error("not found");
      apply(row, args.data);
      return pick(row, args.select);
    },
    async updateMany(args: { where: Where; data: Row }) {
      const found = rows.filter((row) => matches(row, args.where));
      found.forEach((row) => apply(row, args.data));
      return { count: found.length };
    },
    async upsert(args: { where: Where; create: Row; update: Row; select?: Record<string, boolean> }) {
      const row = rows.find((candidate) => matches(candidate, args.where));
      if (row) {
        apply(row, args.update);
        return pick(row, args.select);
      }
      return this.create({ data: args.create, select: args.select });
    },
    async deleteMany(args: { where?: Where } = {}) {
      const before = rows.length;
      for (let index = rows.length - 1; index >= 0; index -= 1) if (matches(rows[index], args.where)) rows.splice(index, 1);
      return { count: before - rows.length };
    },
  };
}
