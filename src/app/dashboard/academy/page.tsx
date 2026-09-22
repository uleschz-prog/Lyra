import type { Metadata } from "next";

import { CourseCatalog } from "@/components/academy/course-catalog";
import { PageHeader } from "@/components/dashboard/page-header";
import { demoUser, courses } from "@/lib/demo-data";
import { rankLabel } from "@/lib/format";

export const metadata: Metadata = {
  title: "Academia",
};

export default function AcademyPage() {
  return (
    <>
      <PageHeader
        eyebrow="Academia"
        title="Formación"
        description={`Tu rango es ${rankLabel[demoUser.rank]}. Los cursos de Maestro permanecen visibles y bloqueados hasta el ascenso.`}
      />
      <CourseCatalog courses={courses} userRank={demoUser.rank} />
    </>
  );
}
