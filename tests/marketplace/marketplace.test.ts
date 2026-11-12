import { describe, expect, it, vi } from "vitest";

import { bundleProject } from "@/lib/builder/bundle";
import { checkGeneratedFile } from "@/lib/builder/checks";
import {
  canView,
  catalogWhere,
  cleanTags,
  cloneTemplate,
  listTemplates,
  marketplaceRules,
  moderateTemplate,
  publishTemplate,
  purchaseTemplate,
  releaseDueEarnings,
  seedOfficialTemplates,
  splitSale,
  unpublishTemplate,
  validPrice,
  type Credits,
  type MarketDb,
  type VersionSnapshot,
} from "@/lib/marketplace/core";
import { officialTemplates } from "@/lib/marketplace/official";
import { findSecret } from "@/lib/vega/secret-filter";

import { table } from "../vega/fake-prisma";

function setup(balances: Record<string, number> = {}) {
  const tables = {
    marketplaceTemplate: table(() => ({ status: "pending", usesCount: 0, salesCount: 0, tags: [], official: false, authorId: null, previewHtml: null, agentConfig: null }), { unique: ["slug"] }),
    marketplacePurchase: table(() => ({ status: "paid" }), { unique: ["templateId", "buyerId"] }),
    marketplaceEarning: table(() => ({ status: "held", releasedAt: null }), { unique: ["purchaseId"] }),
    marketplaceUse: table(() => ({}), { unique: ["requestKey"] }),
    project: table(() => ({ deletedAt: null })),
    projectVersion: table(() => ({}), { unique: ["sourceActionId"] }),
    vegaAgent: table(() => ({ isDefault: false })),
  };
  const ledger: { userId: string; delta: number; ref: string; id: string }[] = [];
  const balance = (userId: string) => (balances[userId] ?? 0) + ledger.filter((entry) => entry.userId === userId).reduce((total, entry) => total + entry.delta, 0);
  const credits: Credits = {
    charge: vi.fn(async (userId: string, amount: number, _description: string, key: string) => {
      const ref = `spend:${key}`;
      const prior = ledger.find((entry) => entry.ref === ref);
      if (prior) return { ok: true as const, chargeId: prior.id, balance: balance(userId), duplicate: true };
      if (balance(userId) < amount) return { ok: false as const, error: `Necesitas ${amount} créditos y tienes ${balance(userId)}.`, balance: balance(userId) };
      const id = `tx${ledger.length + 1}`;
      ledger.push({ userId, delta: -amount, ref, id });
      return { ok: true as const, chargeId: id, balance: balance(userId), duplicate: false };
    }),
    refund: vi.fn(async (chargeId: string | null) => {
      const charge = ledger.find((entry) => entry.id === chargeId);
      if (!charge || ledger.some((entry) => entry.ref === `refund:${chargeId}`)) return;
      ledger.push({ userId: charge.userId, delta: -charge.delta, ref: `refund:${chargeId}`, id: `tx${ledger.length + 1}` });
    }),
    credit: vi.fn(async (input: { userId: string; credits: number; externalRef: string }) => {
      const prior = ledger.find((entry) => entry.ref === input.externalRef);
      if (prior) return { ok: true as const, transactionId: prior.id };
      const id = `tx${ledger.length + 1}`;
      ledger.push({ userId: input.userId, delta: input.credits, ref: input.externalRef, id });
      return { ok: true as const, transactionId: id };
    }),
  };
  return { db: tables as unknown as MarketDb, tables, credits, ledger, balance };
}

const siteFiles = [
  { path: "index.html", content: "<!doctype html><title>Mi sitio</title>" },
  { path: "src/App.tsx", content: "export default function App() { return <main>Hola</main>; }" },
];

async function paidTemplate(env: ReturnType<typeof setup>, price = 50) {
  return env.tables.marketplaceTemplate.create({
    data: { slug: `pago-${price}`, authorId: "seller", kind: "sitio", title: "Landing premium", summary: "Landing", description: "d", price, status: "approved", generator: "vega-v2", files: siteFiles, previewHtml: "<html></html>" },
  }) as Promise<{ id: string }>;
}

describe("Marketplace: plantillas oficiales", () => {
  it("hay 2 sitios, 2 apps y 2 agentes, gratis y con vista previa", () => {
    expect(officialTemplates).toHaveLength(6);
    const count = (kind: string) => officialTemplates.filter((template) => template.kind === kind).length;
    expect([count("sitio"), count("app"), count("agente")]).toEqual([2, 2, 2]);
    for (const template of officialTemplates) {
      const text = JSON.stringify(template.files);
      expect(text, template.slug).not.toMatch(/lorem|ipsum/i);
      for (const file of template.files) expect(findSecret(file.content), `${template.slug} ${file.path}`).toBeNull();
      if (template.kind === "agente") {
        expect(template.agentConfig?.name).toBeTruthy();
        expect(template.agentConfig?.instructions.length).toBeGreaterThan(100);
        expect(template.files.some((file) => file.path === "index.html")).toBe(true);
        expect(template.files.some((file) => file.path === "agente.json")).toBe(true);
      } else {
        expect(template.generator).toBe("vega-v2");
        expect(template.previewHtml?.length).toBeGreaterThan(10_000);
        expect(template.files.some((file) => file.path === "src/App.tsx")).toBe(true);
        expect(template.files.some((file) => file.path === "package.json")).toBe(true);
      }
    }
  });

  it("los sitios y apps oficiales pasan las reglas del generador y compilan con esbuild", async () => {
    for (const template of officialTemplates.filter((item) => item.generator === "vega-v2")) {
      for (const file of template.files.filter((item) => /^src\/(components|pages)\/.+\.tsx$/.test(item.path))) {
        expect(checkGeneratedFile(file.path, file.content), `${template.slug} ${file.path}`).toEqual([]);
      }
      const bundled = await bundleProject(Object.fromEntries(template.files.map((file) => [file.path, file.content])));
      expect(bundled.ok, template.slug).toBe(true);
    }
  }, 60_000);

  it("la siembra es idempotente y deja las 6 aprobadas y gratis", async () => {
    const { db, tables } = setup();
    expect(await seedOfficialTemplates(db, officialTemplates)).toEqual({ inserted: 6 });
    expect(await seedOfficialTemplates(db, officialTemplates)).toEqual({ inserted: 0 });
    // Si falta una (p. ej. otra instancia sembró a medias), solo inserta la que falta.
    tables.marketplaceTemplate.rows.splice(0, 1);
    expect(await seedOfficialTemplates(db, officialTemplates)).toEqual({ inserted: 1 });
    expect(tables.marketplaceTemplate.rows).toHaveLength(6);
    expect(tables.marketplaceTemplate.rows.every((row) => row.status === "approved" && row.price === 0 && row.official === true && row.authorId === null)).toBe(true);
  });
});

describe("Marketplace: catálogo", () => {
  it("lista solo aprobadas y filtra por tipo, precio y búsqueda", async () => {
    const env = setup();
    await seedOfficialTemplates(env.db, officialTemplates);
    await paidTemplate(env);
    await env.tables.marketplaceTemplate.create({ data: { slug: "pendiente", kind: "app", title: "Pendiente", summary: "x", description: "x", price: 0, status: "pending", files: siteFiles } });
    expect(await listTemplates(env.db)).toHaveLength(7);
    expect((await listTemplates(env.db, { kind: "agente" })).map((card) => card.kind)).toEqual(["agente", "agente"]);
    expect(await listTemplates(env.db, { price: "paid" })).toHaveLength(1);
    expect(await listTemplates(env.db, { price: "free" })).toHaveLength(6);
    expect((await listTemplates(env.db, { q: "crm" }))[0].slug).toBe("oficial-crm-kanban");
    expect((await listTemplates(env.db, { q: "whatsapp", kind: "agente" })).length).toBeGreaterThan(0);
    expect(catalogWhere({ kind: "nada" })).toEqual({ status: "approved" });
    const official = (await listTemplates(env.db))[0];
    expect(official.authorName).toBe("LYRA (oficial)");
  });

  it("solo el autor o un admin ven una plantilla no aprobada", () => {
    const pending = { status: "pending", authorId: "a" };
    expect(canView(pending, { id: "a" })).toBe(true);
    expect(canView(pending, { id: "b" })).toBe(false);
    expect(canView(pending, { id: "b", role: "ADMIN" })).toBe(true);
    expect(canView({ status: "approved", authorId: "a" }, null)).toBe(true);
  });
});

describe("Marketplace: usar plantilla", () => {
  it("copia un sitio gratis a Proyectos con su vista previa, una sola vez por clic", async () => {
    const env = setup();
    await seedOfficialTemplates(env.db, officialTemplates);
    const site = env.tables.marketplaceTemplate.rows.find((row) => row.slug === "oficial-clinica-dental-premium")!;
    const first = await cloneTemplate(env.db, { user: { id: "u1" }, templateId: site.id as string, requestKey: "clic-0001" });
    expect(first).toMatchObject({ ok: true, agentId: null, already: false });
    const again = await cloneTemplate(env.db, { user: { id: "u1" }, templateId: site.id as string, requestKey: "clic-0001" });
    expect(again).toMatchObject({ ok: true, already: true });
    expect(env.tables.project.rows).toHaveLength(1);
    expect(env.tables.project.rows[0]).toMatchObject({ userId: "u1", kind: "sitio", title: "Sonríe Pachuca", versionCount: 1 });
    const version = env.tables.projectVersion.rows[0];
    expect(version).toMatchObject({ number: 1, generator: "vega-v2" });
    expect(String(version.previewHtml).length).toBeGreaterThan(10_000);
    expect((version.files as unknown[]).length).toBe((site.files as unknown[]).length);
    expect(site.usesCount).toBe(1);
    // Otro clic (otra llave) crea otro proyecto independiente.
    await cloneTemplate(env.db, { user: { id: "u1" }, templateId: site.id as string, requestKey: "clic-0002" });
    expect(env.tables.project.rows).toHaveLength(2);
  });

  it("un agente crea también el agente en Vega con su configuración", async () => {
    const env = setup();
    await seedOfficialTemplates(env.db, officialTemplates);
    const agentTemplate = env.tables.marketplaceTemplate.rows.find((row) => row.slug === "oficial-agente-ventas-whatsapp")!;
    const result = await cloneTemplate(env.db, { user: { id: "u2" }, templateId: agentTemplate.id as string, requestKey: "clic-agente" });
    expect(result.ok && result.agentId).toBeTruthy();
    expect(env.tables.vegaAgent.rows[0]).toMatchObject({ userId: "u2", name: "Agente de ventas por WhatsApp", avatar: "💬" });
    expect(String(env.tables.vegaAgent.rows[0].instructions)).toContain("Reglas:");
    expect(env.tables.project.rows[0]).toMatchObject({ kind: "agente" });
  });

  it("una plantilla de pago pide comprarla primero (el autor la usa gratis)", async () => {
    const env = setup();
    const template = await paidTemplate(env);
    expect(await cloneTemplate(env.db, { user: { id: "buyer" }, templateId: template.id, requestKey: "clic-pago" })).toMatchObject({ ok: false, needsPurchase: true });
    expect(await cloneTemplate(env.db, { user: { id: "seller" }, templateId: template.id, requestKey: "clic-autor" })).toMatchObject({ ok: true });
  });
});

describe("Marketplace: compra con créditos", () => {
  it("cobra el precio, 10% para LYRA, retiene 7 días al vendedor y no cobra dos veces", async () => {
    const env = setup({ buyer: 100 });
    const template = await paidTemplate(env, 50);
    const now = new Date("2026-11-12T18:00:00Z");
    const bought = await purchaseTemplate(env.db, env.credits, { user: { id: "buyer" }, templateId: template.id, now });
    expect(bought).toMatchObject({ ok: true, already: false, balance: 50 });
    expect(env.balance("buyer")).toBe(50);
    expect(env.tables.marketplacePurchase.rows[0]).toMatchObject({ price: 50, fee: 5, sellerAmount: 45, sellerId: "seller", status: "paid" });
    const earning = env.tables.marketplaceEarning.rows[0];
    expect(earning).toMatchObject({ sellerId: "seller", amount: 45, status: "held" });
    expect((earning.releaseAt as Date).toISOString()).toBe("2026-11-19T18:00:00.000Z");
    expect(env.balance("seller")).toBe(0);

    const again = await purchaseTemplate(env.db, env.credits, { user: { id: "buyer" }, templateId: template.id, now });
    expect(again).toMatchObject({ ok: true, already: true });
    expect(env.balance("buyer")).toBe(50);
    expect(env.tables.marketplacePurchase.rows).toHaveLength(1);
    expect(await cloneTemplate(env.db, { user: { id: "buyer" }, templateId: template.id, requestKey: "clic-comprado" })).toMatchObject({ ok: true });
  });

  it("sin créditos suficientes no compra ni registra nada", async () => {
    const env = setup({ buyer: 10 });
    const template = await paidTemplate(env, 50);
    const result = await purchaseTemplate(env.db, env.credits, { user: { id: "buyer" }, templateId: template.id });
    expect(result).toMatchObject({ ok: false, balance: 10 });
    expect(result.ok ? "" : result.error).toMatch(/Necesitas 50/);
    expect(env.tables.marketplacePurchase.rows).toHaveLength(0);
    expect(env.tables.marketplaceEarning.rows).toHaveLength(0);
  });

  it("si falla el registro de la venta, reembolsa el cobro", async () => {
    const env = setup({ buyer: 100 });
    const template = await paidTemplate(env, 50);
    env.tables.marketplacePurchase.create = vi.fn(async () => {
      throw new Error("db caída");
    }) as never;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await purchaseTemplate(env.db, env.credits, { user: { id: "buyer" }, templateId: template.id });
    expect(result).toMatchObject({ ok: false });
    expect(env.credits.refund).toHaveBeenCalledTimes(1);
    expect(env.balance("buyer")).toBe(100);
  });

  it("no se compra una plantilla gratis, propia o no aprobada", async () => {
    const env = setup({ buyer: 100, seller: 100 });
    const template = await paidTemplate(env, 50);
    expect(await purchaseTemplate(env.db, env.credits, { user: { id: "seller" }, templateId: template.id })).toMatchObject({ ok: false });
    await seedOfficialTemplates(env.db, officialTemplates);
    const free = env.tables.marketplaceTemplate.rows.find((row) => row.official)!;
    expect(await purchaseTemplate(env.db, env.credits, { user: { id: "buyer" }, templateId: free.id as string })).toMatchObject({ ok: false });
    env.tables.marketplaceTemplate.rows[0].status = "unpublished";
    expect(await purchaseTemplate(env.db, env.credits, { user: { id: "buyer" }, templateId: template.id })).toMatchObject({ ok: false });
    expect(env.credits.charge).not.toHaveBeenCalled();
  });

  it("libera la ganancia a los 7 días, una sola vez, como créditos", async () => {
    const env = setup({ buyer: 100 });
    const template = await paidTemplate(env, 50);
    const sold = new Date("2026-11-12T18:00:00Z");
    await purchaseTemplate(env.db, env.credits, { user: { id: "buyer" }, templateId: template.id, now: sold });
    expect(await releaseDueEarnings(env.db, env.credits, { now: new Date("2026-11-18T18:00:00Z") })).toEqual({ released: 0 });
    expect(env.balance("seller")).toBe(0);
    const later = new Date("2026-11-19T18:00:01Z");
    expect(await releaseDueEarnings(env.db, env.credits, { now: later, sellerId: "seller" })).toEqual({ released: 1 });
    expect(await releaseDueEarnings(env.db, env.credits, { now: later })).toEqual({ released: 0 });
    expect(env.balance("seller")).toBe(45);
    expect(env.tables.marketplaceEarning.rows[0]).toMatchObject({ status: "released" });
    expect(env.ledger.filter((entry) => entry.ref.startsWith("market-earning:"))).toHaveLength(1);
  });

  it("reparte 10% redondeado a favor de la plataforma y valida precios", () => {
    expect(splitSale(5)).toEqual({ fee: 1, sellerAmount: 4 });
    expect(splitSale(100)).toEqual({ fee: 10, sellerAmount: 90 });
    expect(splitSale(55)).toEqual({ fee: 6, sellerAmount: 49 });
    expect(validPrice(0)).toBe(0);
    expect(validPrice("25")).toBe(25);
    expect(validPrice(3)).toBeNull();
    expect(validPrice(2.5)).toBeNull();
    expect(validPrice(marketplaceRules.maxPrice + 1)).toBeNull();
  });
});

describe("Marketplace: publicar y moderar", () => {
  const snapshot = (files = siteFiles): VersionSnapshot => ({ files: files.map((file) => ({ ...file })), previewHtml: "<html>v2</html>", generator: "vega-v2", number: 3, kind: "sitio", summary: "Landing de prueba" });

  it("publica una copia fija, pendiente de revisión; el admin la aprueba", async () => {
    const env = setup();
    const source = snapshot();
    const read = vi.fn(async () => source);
    const result = await publishTemplate(
      env.db,
      { user: { id: "autor" }, projectId: "p1", title: "Landing para estudio", description: "Landing con portada, servicios, proceso y contacto por WhatsApp.", category: "Diseño", tags: "Estudio, landing, estudio", price: 20 },
      read,
      () => "abc123",
    );
    expect(result).toEqual({ ok: true, id: expect.any(String), slug: "landing-para-estudio-abc123", status: "pending" });
    const row = env.tables.marketplaceTemplate.rows[0];
    expect(row).toMatchObject({ authorId: "autor", price: 20, status: "pending", sourceVersionNumber: 3, tags: ["estudio", "landing"], previewHtml: "<html>v2</html>" });
    // Cambiar el proyecto después no cambia la plantilla publicada.
    source.files[1].content = "export default function App() { return <main>Cambiado</main>; }";
    expect((row.files as { content: string }[])[1].content).toContain("Hola");
    expect(await listTemplates(env.db)).toHaveLength(0);

    expect(await moderateTemplate(env.db, { admin: { id: "autor" }, id: row.id as string, decision: "approve" })).toMatchObject({ ok: false });
    expect(await moderateTemplate(env.db, { admin: { id: "adm", role: "ADMIN" }, id: row.id as string, decision: "approve" })).toEqual({ ok: true });
    expect(await listTemplates(env.db)).toHaveLength(1);
  });

  it("el admin puede rechazar con motivo y el autor puede retirarla", async () => {
    const env = setup();
    const published = await publishTemplate(env.db, { user: { id: "autor" }, projectId: "p1", title: "App de pedidos", description: "App de pedidos con tablero, lista, alta y kanban por estado.", category: "", tags: [], price: 0 }, async () => snapshot());
    const id = published.ok ? published.id : "";
    await moderateTemplate(env.db, { admin: { id: "adm", role: "ADMIN" }, id, decision: "reject", reason: "Tiene datos de un cliente real" });
    expect(env.tables.marketplaceTemplate.rows[0]).toMatchObject({ status: "rejected", rejectReason: "Tiene datos de un cliente real" });
    expect(await unpublishTemplate(env.db, { user: { id: "otro" }, id })).toMatchObject({ ok: false });
    expect(await unpublishTemplate(env.db, { user: { id: "autor" }, id })).toEqual({ ok: true });
    expect(env.tables.marketplaceTemplate.rows[0].status).toBe("unpublished");
  });

  it("las de un admin se publican aprobadas; las oficiales no se moderan", async () => {
    const env = setup();
    const result = await publishTemplate(env.db, { user: { id: "adm", role: "ADMIN" }, projectId: "p1", title: "Plantilla del equipo", description: "Plantilla publicada por el equipo de LYRA para socios.", category: "", tags: [], price: 0 }, async () => snapshot());
    expect(result).toMatchObject({ ok: true, status: "approved" });
    await seedOfficialTemplates(env.db, officialTemplates);
    const official = env.tables.marketplaceTemplate.rows.find((row) => row.official)!;
    expect(await moderateTemplate(env.db, { admin: { id: "adm", role: "ADMIN" }, id: official.id as string, decision: "reject" })).toMatchObject({ ok: false });
  });

  it("rechaza llaves, precios inválidos, textos cortos y proyectos ajenos", async () => {
    const env = setup();
    const base = { user: { id: "autor" }, projectId: "p1", title: "Landing segura", description: "Landing con portada, servicios, proceso y contacto por WhatsApp.", category: "", tags: [], price: 0 };
    const key = ["sk", "live", "a1B2c3D4e5F6g7H8i9J0k1L2"].join("_");
    const leaked = await publishTemplate(env.db, base, async () => snapshot([...siteFiles, { path: "src/config.ts", content: `export const k = "${key}";` }]));
    expect(leaked).toMatchObject({ ok: false });
    expect(leaked.ok ? "" : leaked.error).toMatch(/src\/config.ts/);
    expect(await publishTemplate(env.db, { ...base, price: 3 }, async () => snapshot())).toMatchObject({ ok: false });
    expect(await publishTemplate(env.db, { ...base, description: "corta" }, async () => snapshot())).toMatchObject({ ok: false });
    expect(await publishTemplate(env.db, base, async () => null)).toMatchObject({ ok: false });
    expect(env.tables.marketplaceTemplate.rows).toHaveLength(0);
  });

  it("limpia etiquetas", () => {
    expect(cleanTags(" Clínica , citas,citas, x, , dental ,uno,dos,tres,cuatro")).toEqual(["clínica", "citas", "dental", "uno", "dos", "tres"]);
  });
});
