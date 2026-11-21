// Datos en vivo: sesiones por PIN, sincronización por número de cambio y escrituras atómicas.
// La base se inyecta (pruebas con Postgres real). Todo se filtra por el espacio de la app publicada.
import type { AppMember, AppRecord, AppSpace, Prisma, PrismaClient } from "@/generated/prisma/client";
import { liveAppLimits, pinAttemptLimits, usageDay } from "@/lib/liveapps/config";
import {
  ADMIN_ROLE,
  branchId as branchIdPattern,
  canRead,
  canWrite,
  normalizeManifest,
  publicManifest,
  recordId,
  validateData,
  type LiveBranch,
  type LiveCollection,
  type LiveManifest,
  type LiveRole,
} from "@/lib/liveapps/manifest";
import { attemptKey, isPin, newSessionToken, pinDigest, randomPin, tokenHash } from "@/lib/liveapps/secrets";

export type LiveDb = PrismaClient;

export type Fail = { ok: false; status: number; error: string };
type Ok<T> = { ok: true } & T;

export class LiveError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function fail(status: number, error: string): Fail {
  return { ok: false, status, error };
}

/* ------------------------------- Lectura ------------------------------- */

export type LiveRow = {
  id: string;
  /** colección */
  c: string;
  /** sucursal */
  b: string | null;
  /** versión */
  v: number;
  /** número de cambio */
  s: number;
  d: Record<string, unknown>;
  /** borrado */
  x: boolean;
  ca: string;
  ua: string;
};

export function serializeRecord(row: Pick<AppRecord, "rid" | "collection" | "branchId" | "version" | "seq" | "data" | "deleted" | "createdAt" | "updatedAt">): LiveRow {
  return {
    id: row.rid,
    c: row.collection,
    b: row.branchId,
    v: row.version,
    s: row.seq,
    d: (row.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {}) as Record<string, unknown>,
    x: row.deleted,
    ca: row.createdAt.toISOString(),
    ua: row.updatedAt.toISOString(),
  };
}

type StoredSchema = { title: string; roles: LiveRole[]; collections: LiveCollection[] };

export function spaceSchema(space: Pick<AppSpace, "schema">): StoredSchema {
  const raw = space.schema as Partial<StoredSchema> | null;
  return {
    title: typeof raw?.title === "string" ? raw.title : "App",
    roles: Array.isArray(raw?.roles) ? raw.roles : [ADMIN_ROLE],
    collections: Array.isArray(raw?.collections) ? raw.collections : [],
  };
}

export function spaceBranches(space: Pick<AppSpace, "branches">): LiveBranch[] {
  return Array.isArray(space.branches) ? (space.branches as LiveBranch[]) : [];
}

const slugPattern = /^[a-z0-9][a-z0-9-]{1,47}$/;

/** Espacio activo de la app publicada en /s/[slug] (o null). */
export async function findLiveSpace(db: LiveDb, slug: string) {
  const clean = slug.toLowerCase();
  if (!slugPattern.test(clean)) return null;
  const publish = await db.projectPublish.findUnique({ where: { slug: clean }, select: { projectId: true, status: true, project: { select: { deletedAt: true, kind: true } } } });
  if (!publish || publish.status !== "published" || publish.project.deletedAt || publish.project.kind !== "app") return null;
  const space = await db.appSpace.findUnique({ where: { projectId: publish.projectId } });
  return space && space.status === "active" ? space : null;
}

export type SessionView = {
  app: { title: string };
  member: { id: string; name: string; role: string; branchId: string | null };
  roles: LiveRole[];
  branches: LiveBranch[];
  collections: LiveCollection[];
  seq: number;
};

export function sessionView(space: AppSpace, member: Pick<AppMember, "id" | "name" | "role" | "branchId">): SessionView {
  const schema = spaceSchema(space);
  return {
    app: { title: schema.title },
    member: { id: member.id, name: member.name, role: member.role, branchId: member.branchId },
    roles: schema.roles,
    branches: spaceBranches(space),
    collections: schema.collections.filter((collection) => canRead(collection, member.role)),
    seq: space.seq,
  };
}

/* ------------------------------- Sesiones ------------------------------- */

async function failedAttempts(db: LiveDb, keyHash: string, windowMs: number, now: Date) {
  return db.authAttempt.count({ where: { keyHash, createdAt: { gte: new Date(now.getTime() - windowMs) } } });
}

async function bumpUsage(db: Pick<LiveDb, "appUsage">, spaceId: string, now: Date, data: { writes?: number; logins?: number }) {
  const day = usageDay(now);
  await db.appUsage.upsert({
    where: { spaceId_day: { spaceId, day } },
    create: { spaceId, day, writes: data.writes ?? 0, logins: data.logins ?? 0 },
    update: { writes: { increment: data.writes ?? 0 }, logins: { increment: data.logins ?? 0 } },
  });
}

/** Entrada con PIN. El PIN identifica a la persona dentro de su app; los fallos se limitan por IP y por app. */
export async function loginWithPin(
  db: LiveDb,
  input: { slug: string; pin: unknown; ip: string; now?: Date },
): Promise<Ok<{ token: string; expiresAt: string; session: SessionView }> | Fail> {
  const now = input.now ?? new Date();
  const slug = input.slug.toLowerCase();
  const ipKey = attemptKey("ip", slug, input.ip || "desconocida");
  const appKey = attemptKey("app", slug);
  const [byIp, byApp] = await Promise.all([
    failedAttempts(db, ipKey, pinAttemptLimits.perIp.windowMs, now),
    failedAttempts(db, appKey, pinAttemptLimits.perApp.windowMs, now),
  ]);
  if (byIp >= pinAttemptLimits.perIp.max || byApp >= pinAttemptLimits.perApp.max) return fail(429, "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.");
  const recordFailure = () =>
    db.authAttempt.createMany({ data: [{ action: "app-pin", keyHash: ipKey, createdAt: now }, { action: "app-pin", keyHash: appKey, createdAt: now }] });

  const space = await findLiveSpace(db, slug);
  if (!space) {
    await recordFailure();
    return fail(404, "Esta app no tiene datos en vivo activos.");
  }
  if (!isPin(input.pin)) {
    await recordFailure();
    return fail(401, "PIN incorrecto.");
  }
  const member = await db.appMember.findUnique({ where: { spaceId_pinDigest: { spaceId: space.id, pinDigest: pinDigest(space.id, input.pin) } } });
  if (!member || !member.active) {
    await recordFailure();
    return fail(401, "PIN incorrecto.");
  }
  await db.authAttempt.deleteMany({ where: { keyHash: { in: [ipKey] } } });
  const token = newSessionToken();
  const expiresAt = new Date(now.getTime() + liveAppLimits.sessionHours * 3_600_000);
  await db.appSession.create({ data: { spaceId: space.id, memberId: member.id, tokenHash: tokenHash(token), expiresAt, windowStart: now, lastUsedAt: now } });
  await db.appMember.update({ where: { id: member.id }, data: { lastSeenAt: now } });
  await bumpUsage(db, space.id, now, { logins: 1 });
  return { ok: true, token, expiresAt: expiresAt.toISOString(), session: sessionView(space, member) };
}

export type LiveContext = { space: AppSpace; member: AppMember; sessionId: string };

/** Valida el token de la app y aplica el límite de peticiones de la sesión. */
export async function authenticate(db: LiveDb, input: { slug: string; token: string | null; now?: Date }): Promise<Ok<{ ctx: LiveContext }> | Fail> {
  const now = input.now ?? new Date();
  if (!input.token || input.token.length > 128) return fail(401, "Ingresa tu PIN.");
  const session = await db.appSession.findUnique({ where: { tokenHash: tokenHash(input.token) }, include: { member: true } });
  if (!session || session.expiresAt <= now || !session.member.active) return fail(401, "Tu sesión terminó. Ingresa tu PIN.");
  const space = await findLiveSpace(db, input.slug);
  if (!space || space.id !== session.spaceId) return fail(401, "Tu sesión terminó. Ingresa tu PIN.");
  const fresh = now.getTime() - session.windowStart.getTime() < 60_000;
  const count = fresh ? session.windowCount + 1 : 1;
  if (count > liveAppLimits.requestsPerMinute) return fail(429, "Demasiadas peticiones. Espera un momento.");
  await db.appSession.update({ where: { id: session.id }, data: { windowCount: count, lastUsedAt: now, ...(fresh ? {} : { windowStart: now }) } });
  return { ok: true, ctx: { space, member: session.member, sessionId: session.id } };
}

export async function logout(db: LiveDb, ctx: LiveContext) {
  await db.appSession.deleteMany({ where: { id: ctx.sessionId } });
}

/* ---------------------------- Sincronización ---------------------------- */

function limitedToBranch(member: Pick<AppMember, "role" | "branchId">) {
  return member.role !== ADMIN_ROLE.key && member.branchId ? member.branchId : null;
}

/**
 * Cambios desde `since` (excluido) hasta el número de cambio actual. Con since = 0 es la carga
 * inicial: sin borrados y, en colecciones «recientes», solo lo de las últimas horas.
 */
export async function listChanges(db: LiveDb, ctx: LiveContext, sinceRaw: unknown, now: Date = new Date()) {
  const head = ctx.space.seq;
  const asked = typeof sinceRaw === "string" ? Number(sinceRaw) : typeof sinceRaw === "number" ? sinceRaw : 0;
  const since = Number.isInteger(asked) && asked >= 0 && asked <= head ? asked : 0;
  const readable = spaceSchema(ctx.space).collections.filter((collection) => canRead(collection, ctx.member.role));
  const all = readable.filter((collection) => since > 0 || collection.sync === "all").map((collection) => collection.key);
  const recent = since === 0 ? readable.filter((collection) => collection.sync === "recent").map((collection) => collection.key) : [];
  const branch = limitedToBranch(ctx.member);
  const and: Prisma.AppRecordWhereInput[] = [
    { OR: [{ collection: { in: all } }, ...(recent.length ? [{ collection: { in: recent }, updatedAt: { gte: new Date(now.getTime() - liveAppLimits.recentHours * 3_600_000) } }] : [])] },
  ];
  if (branch) and.push({ OR: [{ branchId: branch }, { branchId: null }] });
  const rows = await db.appRecord.findMany({
    where: { spaceId: ctx.space.id, seq: { gt: since, lte: head }, ...(since === 0 ? { deleted: false } : {}), AND: and },
    orderBy: { seq: "asc" },
    take: liveAppLimits.maxChanges + 1,
  });
  const more = rows.length > liveAppLimits.maxChanges;
  const page = more ? rows.slice(0, liveAppLimits.maxChanges) : rows;
  return { seq: more ? page[page.length - 1].seq : head, more, reset: since === 0, records: page.map(serializeRecord) };
}

/* ------------------------------ Escrituras ------------------------------ */

export type LiveOp =
  | { op: "create"; c: string; id: string; data: Record<string, unknown>; branch?: string | null }
  | { op: "update"; c: string; id: string; data: Record<string, unknown>; expect?: number }
  | { op: "inc"; c: string; id: string; field: string; by: number }
  | { op: "delete"; c: string; id: string };

type PreparedOp =
  | { op: "create"; collection: LiveCollection; id: string; data: Record<string, unknown>; branchId: string | null }
  | { op: "update"; collection: LiveCollection; id: string; data: Record<string, unknown>; expect?: number }
  | { op: "inc"; collection: LiveCollection; id: string; field: string; by: number }
  | { op: "delete"; collection: LiveCollection; id: string };

function prepareOps(ctx: LiveContext, raw: unknown): { ok: true; ops: PreparedOp[] } | Fail {
  if (!Array.isArray(raw) || raw.length === 0) return fail(400, "No hay cambios que guardar.");
  if (raw.length > liveAppLimits.maxBatchOps) return fail(413, "Demasiados cambios a la vez.");
  const schema = spaceSchema(ctx.space);
  const branches = new Set(spaceBranches(ctx.space).map((branch) => branch.id));
  const fixedBranch = limitedToBranch(ctx.member);
  const ops: PreparedOp[] = [];
  for (const item of raw) {
    const op = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    if (!op) return fail(400, "Cambio inválido.");
    const collection = schema.collections.find((entry) => entry.key === op.c);
    if (!collection) return fail(400, "Esa colección no existe en esta app.");
    if (!canWrite(collection, ctx.member.role)) return fail(403, `Tu rol no puede modificar ${collection.label.toLowerCase()}.`);
    if (typeof op.id !== "string" || !recordId.test(op.id)) return fail(400, "Id de registro inválido.");
    if (op.op === "create") {
      const checked = validateData(collection, op.data, { partial: false });
      if (!checked.ok) return fail(400, checked.error);
      let branchId: string | null = null;
      if (collection.scope === "branch") {
        branchId = fixedBranch ?? (typeof op.branch === "string" && branches.has(op.branch) ? op.branch : null);
        if (!branchId) return fail(400, "Elige la sucursal.");
      }
      ops.push({ op: "create", collection, id: op.id, data: checked.data, branchId });
    } else if (op.op === "update") {
      const checked = validateData(collection, op.data, { partial: true });
      if (!checked.ok) return fail(400, checked.error);
      const expect = typeof op.expect === "number" && Number.isInteger(op.expect) ? op.expect : undefined;
      ops.push({ op: "update", collection, id: op.id, data: checked.data, ...(expect !== undefined ? { expect } : {}) });
    } else if (op.op === "inc") {
      const field = collection.fields.find((entry) => entry.key === op.field);
      if (!field || (field.type !== "number" && field.type !== "money")) return fail(400, "Solo se pueden sumar campos numéricos.");
      if (typeof op.by !== "number" || !Number.isFinite(op.by) || Math.abs(op.by) > 1e9) return fail(400, "Cantidad inválida.");
      ops.push({ op: "inc", collection, id: op.id, field: field.key, by: op.by });
    } else if (op.op === "delete") {
      ops.push({ op: "delete", collection, id: op.id });
    } else {
      return fail(400, "Operación desconocida.");
    }
  }
  return { ok: true, ops };
}

function json(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/**
 * Aplica varias operaciones como una sola transacción: o entran todas o ninguna. El primer paso
 * bloquea la fila del espacio (toma los números de cambio), así las escrituras de una app se
 * ordenan y un «sumar» nunca pisa a otro.
 */
export async function applyBatch(db: LiveDb, ctx: LiveContext, raw: unknown, now: Date = new Date()): Promise<Ok<{ seq: number; records: LiveRow[] }> | Fail> {
  const prepared = prepareOps(ctx, raw);
  if (!prepared.ok) return prepared;
  const { ops } = prepared;
  const usage = await db.appUsage.findUnique({ where: { spaceId_day: { spaceId: ctx.space.id, day: usageDay(now) } }, select: { writes: true } });
  if ((usage?.writes ?? 0) + ops.length > liveAppLimits.writesPerDay) return fail(429, "Esta app llegó a su límite de escrituras de hoy.");
  const fixedBranch = limitedToBranch(ctx.member);
  try {
    const result = await db.$transaction(
      async (tx) => {
        const head = await tx.appSpace.update({ where: { id: ctx.space.id }, data: { seq: { increment: ops.length } }, select: { seq: true, recordCount: true, status: true } });
        if (head.status !== "active") throw new LiveError(403, "Esta app está en pausa.");
        const creates = ops.filter((op) => op.op === "create").length;
        if (head.recordCount + creates > liveAppLimits.maxRecords) throw new LiveError(413, "Esta app llegó a su límite de registros.");
        let seq = head.seq - ops.length;
        let delta = 0;
        const touched = new Map<string, AppRecord>();
        for (const op of ops) {
          seq += 1;
          const key = { spaceId_rid: { spaceId: ctx.space.id, rid: op.id } };
          const existing = touched.get(op.id) ?? (await tx.appRecord.findUnique({ where: key }));
          if (op.op === "create") {
            if (existing) throw new LiveError(409, "Ese registro ya existe.");
            const row = await tx.appRecord.create({
              data: { spaceId: ctx.space.id, rid: op.id, collection: op.collection.key, branchId: op.branchId, data: json(op.data), seq, createdById: ctx.member.id, updatedById: ctx.member.id },
            });
            delta += 1;
            touched.set(op.id, row);
            continue;
          }
          if (!existing || existing.deleted) throw new LiveError(404, `Ese ${op.collection.singular.toLowerCase()} ya no existe. Actualiza la pantalla.`);
          if (existing.collection !== op.collection.key) throw new LiveError(400, "El registro no es de esa colección.");
          if (fixedBranch && existing.branchId && existing.branchId !== fixedBranch) throw new LiveError(403, "Ese registro es de otra sucursal.");
          const current = (existing.data && typeof existing.data === "object" && !Array.isArray(existing.data) ? existing.data : {}) as Record<string, unknown>;
          let data: Record<string, unknown> = current;
          let deleted = false;
          if (op.op === "update") {
            if (op.expect !== undefined && op.expect !== existing.version) throw new LiveError(409, "Alguien más cambió este registro. Revisa y vuelve a intentar.");
            data = { ...current, ...op.data };
            if (JSON.stringify(data).length > liveAppLimits.maxRecordBytes) throw new LiveError(413, "El registro es demasiado grande.");
          } else if (op.op === "inc") {
            const value = Number(current[op.field]);
            data = { ...current, [op.field]: Math.round(((Number.isFinite(value) ? value : 0) + op.by) * 10_000) / 10_000 };
          } else {
            deleted = true;
            delta -= 1;
          }
          const row = await tx.appRecord.update({
            where: { id: existing.id },
            data: { data: json(data), deleted, version: { increment: 1 }, seq, updatedById: ctx.member.id },
          });
          touched.set(op.id, row);
        }
        if (delta) await tx.appSpace.update({ where: { id: ctx.space.id }, data: { recordCount: { increment: delta } } });
        await bumpUsage(tx, ctx.space.id, now, { writes: ops.length });
        return { seq: head.seq, records: [...touched.values()].map(serializeRecord) };
      },
      { timeout: 20_000, maxWait: 8_000 },
    );
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof LiveError) return fail(error.status, error.message);
    if (error && typeof error === "object" && (error as { code?: unknown }).code === "P2002") return fail(409, "Ese registro ya existe.");
    throw error;
  }
}

/* ------------------------------- Dueño ------------------------------- */

async function ownedProject(db: LiveDb, userId: string, projectId: string) {
  if (typeof projectId !== "string" || !/^[a-z0-9]{10,40}$/i.test(projectId)) return null;
  return db.project.findFirst({ where: { id: projectId, userId, deletedAt: null }, select: { id: true, kind: true, title: true } });
}

export async function ownedSpace(db: LiveDb, userId: string, projectId: string) {
  const project = await ownedProject(db, userId, projectId);
  if (!project) return null;
  return db.appSpace.findUnique({ where: { projectId: project.id } });
}

async function uniquePin(db: Pick<LiveDb, "appMember">, spaceId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pin = randomPin();
    const taken = await db.appMember.findUnique({ where: { spaceId_pinDigest: { spaceId, pinDigest: pinDigest(spaceId, pin) } }, select: { id: true } });
    if (!taken) return pin;
  }
  throw new Error("No se pudo generar un PIN único.");
}

function seedRecords(manifest: LiveManifest) {
  const rows: { rid: string; collection: string; branchId: string | null; data: Record<string, unknown> }[] = [];
  const seen = new Set<string>();
  const branches = manifest.branches.map((branch) => branch.id);
  for (const collection of manifest.collections) {
    (collection.seed ?? []).forEach((seed, index) => {
      const checked = validateData(collection, seed, { partial: true });
      if (!checked.ok) return;
      const rid = typeof seed.id === "string" && recordId.test(seed.id) ? seed.id : `${collection.key}-s${index}`;
      if (seen.has(rid)) return;
      seen.add(rid);
      const branchId = collection.scope === "branch" ? (typeof seed.branchId === "string" && branches.includes(seed.branchId) ? seed.branchId : branches[0]) : null;
      rows.push({ rid, collection: collection.key, branchId, data: checked.data });
    });
  }
  return rows;
}

/**
 * Activa datos en vivo para una app del socio con el manifiesto de su versión. La primera vez
 * crea el espacio, carga las semillas y un acceso «Administración» con PIN (se muestra una vez).
 * Si ya existía, actualiza el esquema (los datos se conservan) y lo reactiva.
 */
export async function enableLiveSpace(
  db: LiveDb,
  input: { userId: string; projectId: string; manifest: unknown; adminName?: string },
): Promise<Ok<{ spaceId: string; created: boolean; adminPin: string | null }> | Fail> {
  const project = await ownedProject(db, input.userId, input.projectId);
  if (!project) return fail(404, "No encontramos ese proyecto.");
  if (project.kind !== "app") return fail(400, "Los datos en vivo son para apps.");
  const manifest = normalizeManifest(input.manifest);
  if (!manifest) return fail(400, "Esta versión no trae el esquema de datos en vivo. Pídele a Vega una versión con datos en vivo.");
  const schema = json(publicManifest(manifest) as unknown as Record<string, unknown>);
  const existing = await db.appSpace.findUnique({ where: { projectId: project.id } });
  if (existing) {
    await db.appSpace.update({ where: { id: existing.id }, data: { schema, status: "active" } });
    return { ok: true, spaceId: existing.id, created: false, adminPin: null };
  }
  const seeds = seedRecords(manifest);
  return db.$transaction(
    async (tx) => {
      const space = await tx.appSpace.create({
        data: { projectId: project.id, userId: input.userId, schema, branches: manifest.branches as unknown as Prisma.InputJsonValue, seq: seeds.length, recordCount: seeds.length },
      });
      if (seeds.length) {
        await tx.appRecord.createMany({
          data: seeds.map((seed, index) => ({ spaceId: space.id, rid: seed.rid, collection: seed.collection, branchId: seed.branchId, data: json(seed.data), seq: index + 1 })),
        });
      }
      const adminPin = randomPin();
      await tx.appMember.create({ data: { spaceId: space.id, name: (input.adminName ?? "Administración").slice(0, 40), role: ADMIN_ROLE.key, branchId: null, pinDigest: pinDigest(space.id, adminPin) } });
      return { ok: true as const, spaceId: space.id, created: true, adminPin };
    },
    { timeout: 30_000, maxWait: 8_000 },
  );
}

export type MemberView = { id: string; name: string; role: string; branchId: string | null; active: boolean; lastSeenAt: string | null };

export async function listMembers(db: LiveDb, userId: string, projectId: string): Promise<MemberView[] | null> {
  const space = await ownedSpace(db, userId, projectId);
  if (!space) return null;
  const rows = await db.appMember.findMany({ where: { spaceId: space.id }, orderBy: [{ active: "desc" }, { createdAt: "asc" }] });
  return rows.map((row) => ({ id: row.id, name: row.name, role: row.role, branchId: row.branchId, active: row.active, lastSeenAt: row.lastSeenAt?.toISOString() ?? null }));
}

function checkMemberInput(space: AppSpace, input: { name: unknown; role: unknown; branchId: unknown }): { ok: true; name: string; role: string; branchId: string | null } | Fail {
  const name = typeof input.name === "string" ? input.name.replace(/\s+/g, " ").trim().slice(0, 40) : "";
  if (name.length < 2) return fail(400, "Escribe el nombre de la persona.");
  const role = typeof input.role === "string" ? input.role : "";
  if (!spaceSchema(space).roles.some((entry) => entry.key === role)) return fail(400, "Elige un rol de la app.");
  const branches = spaceBranches(space);
  let branchId = typeof input.branchId === "string" && input.branchId ? input.branchId : null;
  if (branchId && !branches.some((branch) => branch.id === branchId)) return fail(400, "Esa sucursal no existe.");
  if (!branchId && role !== ADMIN_ROLE.key) {
    if (branches.length === 1) branchId = branches[0].id;
    else return fail(400, "Elige la sucursal donde trabaja.");
  }
  return { ok: true, name, role, branchId };
}

/** Alta de una persona del equipo; regresa su PIN (solo se muestra esta vez). */
export async function addMember(db: LiveDb, input: { userId: string; projectId: string; name: unknown; role: unknown; branchId: unknown }): Promise<Ok<{ member: MemberView; pin: string }> | Fail> {
  const space = await ownedSpace(db, input.userId, input.projectId);
  if (!space) return fail(404, "Activa primero los datos en vivo.");
  const checked = checkMemberInput(space, input);
  if (!checked.ok) return checked;
  const count = await db.appMember.count({ where: { spaceId: space.id, active: true } });
  if (count >= liveAppLimits.maxMembers) return fail(400, `Máximo ${liveAppLimits.maxMembers} personas por app.`);
  const pin = await uniquePin(db, space.id);
  const row = await db.appMember.create({ data: { spaceId: space.id, name: checked.name, role: checked.role, branchId: checked.branchId, pinDigest: pinDigest(space.id, pin) } });
  return { ok: true, pin, member: { id: row.id, name: row.name, role: row.role, branchId: row.branchId, active: true, lastSeenAt: null } };
}

async function ownedMember(db: LiveDb, userId: string, projectId: string, memberId: unknown) {
  const space = await ownedSpace(db, userId, projectId);
  if (!space || typeof memberId !== "string") return null;
  const member = await db.appMember.findFirst({ where: { id: memberId, spaceId: space.id } });
  return member ? { space, member } : null;
}

/** Nuevo PIN (cierra sus sesiones abiertas). */
export async function resetMemberPin(db: LiveDb, input: { userId: string; projectId: string; memberId: unknown }): Promise<Ok<{ pin: string }> | Fail> {
  const found = await ownedMember(db, input.userId, input.projectId, input.memberId);
  if (!found) return fail(404, "No encontramos a esa persona.");
  const pin = await uniquePin(db, found.space.id);
  await db.$transaction([
    db.appMember.update({ where: { id: found.member.id }, data: { pinDigest: pinDigest(found.space.id, pin), active: true } }),
    db.appSession.deleteMany({ where: { memberId: found.member.id } }),
  ]);
  return { ok: true, pin };
}

/** Dar de baja o reactivar (la baja cierra sus sesiones). Siempre queda al menos un admin activo. */
export async function setMemberActive(db: LiveDb, input: { userId: string; projectId: string; memberId: unknown; active: boolean }): Promise<Ok<object> | Fail> {
  const found = await ownedMember(db, input.userId, input.projectId, input.memberId);
  if (!found) return fail(404, "No encontramos a esa persona.");
  if (!input.active && found.member.role === ADMIN_ROLE.key) {
    const admins = await db.appMember.count({ where: { spaceId: found.space.id, role: ADMIN_ROLE.key, active: true } });
    if (admins <= 1) return fail(400, "Debe quedar al menos una persona de Administración.");
  }
  await db.appMember.update({ where: { id: found.member.id }, data: { active: input.active } });
  if (!input.active) await db.appSession.deleteMany({ where: { memberId: found.member.id } });
  return { ok: true };
}

/** Renombra o agrega sucursales (los ids existentes no cambian: sus registros siguen ligados). */
export async function saveBranches(db: LiveDb, input: { userId: string; projectId: string; branches: unknown }): Promise<Ok<{ branches: LiveBranch[] }> | Fail> {
  const space = await ownedSpace(db, input.userId, input.projectId);
  if (!space) return fail(404, "Activa primero los datos en vivo.");
  const current = spaceBranches(space);
  const next: LiveBranch[] = [];
  for (const item of Array.isArray(input.branches) ? input.branches : []) {
    const raw = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const name = typeof raw.name === "string" ? raw.name.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    if (!name) continue;
    let id = typeof raw.id === "string" && branchIdPattern.test(raw.id) ? raw.id : "";
    if (!id) {
      const base = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "sucursal";
      id = base;
      // Un id nuevo nunca reutiliza uno existente (ni de una sucursal quitada): sus registros se quedarían ligados.
      for (let index = 2; next.some((branch) => branch.id === id) || current.some((branch) => branch.id === id); index += 1) id = `${base}-${index}`;
    }
    if (next.some((branch) => branch.id === id)) continue;
    next.push({ id, name });
  }
  if (!next.length) return fail(400, "Debe haber al menos una sucursal.");
  if (next.length > liveAppLimits.maxBranches) return fail(400, `Máximo ${liveAppLimits.maxBranches} sucursales.`);
  const removed = current.filter((branch) => !next.some((kept) => kept.id === branch.id)).map((branch) => branch.id);
  if (removed.length) {
    const [members, records] = await Promise.all([
      db.appMember.count({ where: { spaceId: space.id, active: true, branchId: { in: removed } } }),
      db.appRecord.count({ where: { spaceId: space.id, deleted: false, branchId: { in: removed } } }),
    ]);
    if (members || records) return fail(400, "No se puede quitar una sucursal con personas o registros; renómbrala.");
  }
  await db.appSpace.update({ where: { id: space.id }, data: { branches: next as unknown as Prisma.InputJsonValue } });
  return { ok: true, branches: next };
}

export async function setSpaceStatus(db: LiveDb, input: { userId: string; projectId: string; active: boolean }): Promise<Ok<object> | Fail> {
  const space = await ownedSpace(db, input.userId, input.projectId);
  if (!space) return fail(404, "Activa primero los datos en vivo.");
  await db.appSpace.update({ where: { id: space.id }, data: { status: input.active ? "active" : "paused" } });
  if (!input.active) await db.appSession.deleteMany({ where: { spaceId: space.id } });
  return { ok: true };
}
