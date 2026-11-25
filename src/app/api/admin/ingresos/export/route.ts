import { incomeCsv, incomeReport, parseIncomeFilters } from "@/lib/admin/income";
import { incomeAdmin } from "@/lib/admin/income-guard";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** CSV con los mismos filtros de la vista. */
export async function GET(request: Request) {
  const access = await incomeAdmin();
  if (!access.ok) return access.response;
  const now = new Date();
  const report = await incomeReport(getPrisma(), parseIncomeFilters(new URL(request.url).searchParams, now), now);
  return new Response(incomeCsv(report.rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="lyra-ingresos-${report.today}.csv"`,
      "cache-control": "no-store",
    },
  });
}
