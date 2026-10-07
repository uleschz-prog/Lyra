import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CourseCatalog } from "@/components/academy/course-catalog";
import { PageHeader } from "@/components/dashboard/page-header";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { courses } from "@/lib/demo-data";

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
        description="Todos los cursos están abiertos con cualquier membresía."
        section="academy"
      />
      <CourseCatalog courses={courses} />
    </>
  );
}
