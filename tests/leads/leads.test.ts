import { describe, expect, it } from "vitest";

import {
  leadKey,
  leadLimits,
  leadsCsv,
  parseLeadBody,
  submitLead,
  summarizeFields,
  type LeadDb,
} from "@/lib/leads/core";
import { leadRuntimeScript } from "@/lib/leads/runtime";
import { publishProject, type PublishDb } from "@/lib/publish/core";

import { fakePublishDb } from "../publish/fake-db";

type Lead = Record<string, unknown> & { projectId: string; createdAt: Date };

async function setup(kind = "sitio") {
  const fake = fakePublishDb();
  fake.addProject({ id: "projectaaaa1", userId: "u1", kind });
  const leads: Lead[] = [];
  const attempts: { keyHash: string; createdAt: Date }[] = [];
  const db = {
    ...fake.db,
    projectLead: {
      count: async ({
        where,
      }: {
        where: { projectId: string; createdAt: { gte: Date } };
      }) =>
        leads.filter(
          (lead) =>
            lead.projectId === where.projectId &&
            lead.createdAt >= where.createdAt.gte,
        ).length,
      create: async ({ data }: { data: Lead }) => {
        leads.push(data);
        return { id: `lead${leads.length}` };
      },
    },
    authAttempt: {
      count: async ({
        where,
      }: {
        where: { keyHash: string; createdAt: { gte: Date } };
      }) =>
        attempts.filter(
          (item) =>
            item.keyHash === where.keyHash &&
            item.createdAt >= where.createdAt.gte,
        ).length,
      createMany: async ({
        data,
      }: {
        data: { keyHash: string; createdAt: Date }[];
      }) => {
        attempts.push(...data);
        return { count: data.length };
      },
    },
  };
  await publishProject(fake.db as unknown as PublishDb, {
    userId: "u1",
    projectId: "projectaaaa1",
    slug: "taqueria",
    versionNumber: 2,
    indexable: false,
  });
  return { db: db as unknown as LeadDb, leads, attempts, fake };
}

const body = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    fields: [
      { label: "Nombre", value: "Ana López" },
      { label: "Teléfono", value: "771 123 4567" },
      {
        label: "¿Qué necesitas?",
        value: "Quiero cotizar tacos para 40 personas el sábado",
      },
    ],
    hp: "",
    page: "#/contacto",
    t: 9000,
    ...extra,
  });

describe("contactos de sitios publicados", () => {
  it("guarda el contacto del sitio publicado con sus datos principales", async () => {
    const { db, leads } = await setup();
    const result = await submitLead(db, {
      slug: "taqueria",
      ip: "1.1.1.1",
      text: body(),
    });
    expect(result).toEqual({ status: 200, body: { ok: true } });
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      userId: "u1",
      slug: "taqueria",
      versionNumber: 2,
      name: "Ana López",
      phone: "771 123 4567",
      message: "Quiero cotizar tacos para 40 personas el sábado",
    });
  });

  it("la trampa para bots y el envío instantáneo responden ok pero no guardan", async () => {
    const { db, leads } = await setup();
    expect(
      (
        await submitLead(db, {
          slug: "taqueria",
          ip: "2.2.2.2",
          text: body({ hp: "soy un bot" }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await submitLead(db, {
          slug: "taqueria",
          ip: "3.3.3.3",
          text: body({ t: 200 }),
        })
      ).status,
    ).toBe(200);
    expect(leads).toHaveLength(0);
  });

  it("valida tamaño, formato, campos vacíos y enlaces", async () => {
    expect(parseLeadBody("no es json").ok).toBe(false);
    expect(parseLeadBody(JSON.stringify({ fields: [] })).ok).toBe(false);
    expect(parseLeadBody("x".repeat(leadLimits.maxBodyBytes + 1)).ok).toBe(
      false,
    );
    expect(
      parseLeadBody(
        JSON.stringify({
          fields: Array.from({ length: 16 }, (_, i) => ({
            label: `c${i}`,
            value: "v",
          })),
        }),
      ).ok,
    ).toBe(false);
    expect(
      parseLeadBody(
        JSON.stringify({
          fields: {
            Mensaje: "http://a.com http://b.com http://c.com http://d.com",
          },
        }),
      ).ok,
    ).toBe(false);
    const parsed = parseLeadBody(
      JSON.stringify({
        fields: { Nombre: "  Ana\u0000  ", Correo: "ana@correo.mx" },
      }),
    );
    expect(parsed.ok && parsed.fields).toEqual([
      { label: "Nombre", value: "Ana" },
      { label: "Correo", value: "ana@correo.mx" },
    ]);
    const { db } = await setup();
    expect(
      (await submitLead(db, { slug: "taqueria", ip: "4.4.4.4", text: "{}" }))
        .status,
    ).toBe(400);
  });

  it("limita por persona y por sitio", async () => {
    const { db, leads } = await setup();
    for (let i = 0; i < leadLimits.perIpPerSite10Min; i += 1)
      await submitLead(db, { slug: "taqueria", ip: "5.5.5.5", text: body() });
    expect(
      (await submitLead(db, { slug: "taqueria", ip: "5.5.5.5", text: body() }))
        .status,
    ).toBe(429);
    expect(leads).toHaveLength(leadLimits.perIpPerSite10Min);
    // Por sitio: 30 por hora aunque vengan de IPs distintas.
    for (let i = 0; leads.length < leadLimits.perSitePerHour; i += 1)
      await submitLead(db, {
        slug: "taqueria",
        ip: `10.0.0.${i}`,
        text: body(),
      });
    expect(
      (await submitLead(db, { slug: "taqueria", ip: "9.9.9.9", text: body() }))
        .status,
    ).toBe(429);
  });

  it("no recibe contactos si no está publicado o si es una app", async () => {
    const { db } = await setup();
    expect(
      (await submitLead(db, { slug: "otra", ip: "1.1.1.1", text: body() }))
        .status,
    ).toBe(404);
    const app = await setup("app");
    expect(
      (
        await submitLead(app.db, {
          slug: "taqueria",
          ip: "1.1.1.1",
          text: body(),
        })
      ).status,
    ).toBe(404);
  });

  it("guarda hashes, nunca la IP", async () => {
    const { db, attempts } = await setup();
    await submitLead(db, { slug: "taqueria", ip: "8.8.8.8", text: body() });
    expect(attempts.map((item) => item.keyHash)).toContain(
      leadKey("ip+site", "8.8.8.8", "taqueria"),
    );
    expect(JSON.stringify(attempts)).not.toContain("8.8.8.8");
  });

  it("reconoce correo por formato y mensaje largo sin etiqueta", () => {
    expect(
      summarizeFields([
        { label: "email", value: "no-es-correo" },
        { label: "x", value: "ana@mail.com" },
      ]).email,
    ).toBe("ana@mail.com");
    expect(
      summarizeFields([
        {
          label: "Campo",
          value: "Necesito información sobre los paquetes de boda",
        },
      ]).message,
    ).toContain("paquetes");
  });

  it("el CSV escapa comillas y fórmulas", () => {
    const csv = leadsCsv([
      {
        createdAt: new Date("2026-11-18T19:00:00Z"),
        name: '=HYPERLINK("x")',
        email: null,
        phone: null,
        message: 'Dijo "hola"',
        page: null,
        fields: [],
        read: false,
      },
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"Dijo ""hola"""');
  });

  it("el script del sitio publica solo al endpoint indicado y sin credenciales", () => {
    const script = leadRuntimeScript(
      "https://lyyra.vercel.app/api/s/taqueria/contacto",
    );
    expect(script).toContain(
      '"https://lyyra.vercel.app/api/s/taqueria/contacto"',
    );
    expect(script).toContain('credentials:"omit"');
    expect(script.match(/<\/script>/g)).toHaveLength(1);
  });
});
