import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CourseCatalog } from "@/components/academy/course-catalog";
import { PageHeader } from "@/components/dashboard/page-header";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { courses } from "@/lib/demo-data";
import { rankLabel } from "@/lib/format";

export const metadata: Metadata = {
  title: "Academia",
};

export default async function AcademyPage() {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);

  return (
    <>
      <PageHeader
        eyebrow="Academia"
        title="Formación"
        description={`Tu rango es ${rankLabel[user.rank]}. Los cursos de un rango superior permanecen visibles y bloqueados.`}
        section="academy"
      />
      <CourseCatalog courses={courses} userRank={user.rank} />
    </>
  );
}
