import { editIncomeAmount, incomeHistory } from "@/lib/admin/income";
import { incomeAdmin, noStore, readJson, writeAllowed } from "@/lib/admin/income-guard";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ key: string }> };

/** Bitácora de cambios de un ingreso. */
export async function GET(_request: Request, context: Context) {
  const access = await incomeAdmin();
  if (!access.ok) return access.response;
  const { key } = await context.params;
  const history = await incomeHistory(getPrisma(), decodeURIComponent(key));
  if (!history) return Response.json({ error: "Ese ingreso no existe." }, { status: 404 });
  return Response.json({ edits: history }, { headers: noStore });
}

/** Cambia el monto vigente (con motivo). El pago original, los créditos y las comisiones no cambian. */
export async function PATCH(request: Request, context: Context) {
  const access = await incomeAdmin();
  if (!access.ok) return access.response;
  const blocked = writeAllowed(request);
  if (blocked) return blocked;
  const body = await readJson(request);
  if (!body) return Response.json({ error: "Datos no válidos." }, { status: 400 });
  const { key } = await context.params;
  const result = await editIncomeAmount(getPrisma(), access.admin, { key: decodeURIComponent(key), amount: body.amount, reason: body.reason });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  console.info("[Ingresos] monto editado", { key, adminId: access.admin.id, from: result.edit.previousAmount, to: result.edit.newAmount });
  return Response.json({ edit: result.edit, originalAmount: result.originalAmount }, { headers: noStore });
}
