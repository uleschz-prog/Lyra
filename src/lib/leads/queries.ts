import { getPrisma } from "@/lib/prisma";
import type { LeadField } from "@/lib/leads/core";

export type LeadItem = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  fields: LeadField[];
  page: string | null;
  versionNumber: number | null;
  read: boolean;
  createdAt: string;
};

const leadSelect = { id: true, name: true, email: true, phone: true, message: true, fields: true, page: true, versionNumber: true, read: true, createdAt: true } as const;

function fieldsOf(value: unknown): LeadField[] {
  return Array.isArray(value)
    ? value.filter((item): item is LeadField => Boolean(item) && typeof (item as LeadField).label === "string" && typeof (item as LeadField).value === "string")
    : [];
}

/** Contactos de un proyecto, solo para su dueño (los más nuevos primero). */
export async function listLeads(userId: string, projectId: string, take = 200): Promise<LeadItem[]> {
  const rows = await getPrisma().projectLead.findMany({ where: { projectId, userId }, orderBy: { createdAt: "desc" }, take, select: leadSelect });
  return rows.map((row) => ({ ...row, fields: fieldsOf(row.fields), createdAt: row.createdAt.toISOString() }));
}

export async function countUnreadLeads(userId: string, projectId: string) {
  return getPrisma().projectLead.count({ where: { projectId, userId, read: false } });
}

export async function leadsForCsv(userId: string, projectId: string) {
  return getPrisma().projectLead.findMany({
    where: { projectId, userId },
    orderBy: { createdAt: "desc" },
    take: 5000,
    select: { createdAt: true, name: true, email: true, phone: true, message: true, page: true, fields: true, read: true },
  });
}
