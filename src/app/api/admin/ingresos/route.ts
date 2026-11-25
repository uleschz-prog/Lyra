import { addManualIncome, incomeReport, parseIncomeFilters } from "@/lib/admin/income";
import { incomeAdmin, noStore, readJson, writeAllowed } from "@/lib/admin/income-guard";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Lista de ingresos con totales (hoy, mes en curso y el rango filtrado). */
export async function GET(request: Request) {
  const access = await incomeAdmin();
  if (!access.ok) return access.response;
  const now = new Date();
  const filters = parseIncomeFilters(new URL(request.url).searchParams, now);
  const report = await incomeReport(getPrisma(), filters, now);
  return Response.json(report, { headers: noStore });
}

/** Captura manual de un ingreso (solo registro contable: no acredita créditos ni paga comisiones). */
export async function POST(request: Request) {
  const access = await incomeAdmin();
  if (!access.ok) return access.response;
  const blocked = writeAllowed(request);
  if (blocked) return blocked;
  const body = await readJson(request);
  if (!body) return Response.json({ error: "Datos no válidos." }, { status: 400 });
  const result = await addManualIncome(getPrisma(), access.admin, body, new Date());
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  console.info("[Ingresos] captura manual", { id: result.id, adminId: access.admin.id });
  return Response.json({ id: result.id }, { status: 201, headers: noStore });
}
