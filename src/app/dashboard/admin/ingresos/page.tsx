import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { IncomePanel } from "@/components/admin/income-panel";
import { PageHeader } from "@/components/dashboard/page-header";
import { incomeReport, parseIncomeFilters } from "@/lib/admin/income";
import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Ingresos · Panel admin",
};

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function toUrlParams(raw: SearchParams) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string") params.set(key, first);
  }
  return params;
}

export default async function AdminIncomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const admin = await getCurrentUser();
  if (admin?.role !== "ADMIN") redirect("/dashboard");

  const now = new Date();
  const report = await incomeReport(
    getPrisma(),
    parseIncomeFilters(toUrlParams(await searchParams), now),
    now,
  );

  return (
    <>
      <Link
        href="/dashboard/admin"
        className="mb-4 inline-flex text-sm text-[#7C3AED] hover:underline"
      >
        ← Panel admin
      </Link>
      <PageHeader
        eyebrow="Administración"
        title="Ingresos"
        description="El dinero que ha entrado a la empresa y de qué socio: inscripciones, recargas de créditos, recompras y upgrades pagados en la plataforma, más lo que registres a mano."
      />
      <IncomePanel initial={report} />
    </>
  );
}
