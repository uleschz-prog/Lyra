/** Base de datos en memoria para probar consultas simples de Prisma (sin Postgres). */

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

function matchValue(value: unknown, condition: unknown): boolean {
  if (condition && typeof condition === "object" && !(condition instanceof Date)) {
    const spec = condition as Record<string, unknown>;
    if ("gt" in spec) return value instanceof Date && spec.gt instanceof Date ? value.getTime() > spec.gt.getTime() : Number(value) > Number(spec.gt);
    if ("in" in spec) return (spec.in as unknown[]).includes(value);
    if ("contains" in spec) {
      const needle = String(spec.contains);
      return spec.mode === "insensitive" ? String(value).toLowerCase().includes(needle.toLowerCase()) : String(value).includes(needle);
    }
    if ("equals" in spec) {
      return spec.mode === "insensitive" ? String(value).toLowerCase() === String(spec.equals).toLowerCase() : value === spec.equals;
    }
  }
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

export function table(defaults: (data: Row) => Row = () => ({})) {
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
    async count(args: { where?: Where } = {}) {
      return rows.filter((row) => matches(row, args.where)).length;
    },
    async create(args: { data: Row; select?: Record<string, boolean> }) {
      const now = tick();
      const row = { id: `id${(counter += 1)}`, createdAt: now, updatedAt: now, ...defaults(args.data), ...args.data };
      rows.push(row);
      return pick(row, args.select);
    },
    async update(args: { where: Where; data: Row; select?: Record<string, boolean> }) {
      const row = rows.find((candidate) => matches(candidate, args.where));
      if (!row) throw new Error("not found");
      Object.assign(row, args.data);
      return pick(row, args.select);
    },
    async updateMany(args: { where: Where; data: Row }) {
      const found = rows.filter((row) => matches(row, args.where));
      found.forEach((row) => Object.assign(row, args.data));
      return { count: found.length };
    },
    async deleteMany(args: { where?: Where } = {}) {
      const before = rows.length;
      for (let index = rows.length - 1; index >= 0; index -= 1) if (matches(rows[index], args.where)) rows.splice(index, 1);
      return { count: before - rows.length };
    },
  };
}
