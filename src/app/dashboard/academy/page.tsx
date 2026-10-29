import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CourseCatalog } from "@/components/academy/course-catalog";
import { PageHeader } from "@/components/dashboard/page-header";
import { MarketplaceCourseCatalog } from "@/components/academy/marketplace-course-catalog";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { courses } from "@/lib/demo-data";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Academia",
};

export default async function AcademyPage({
  searchParams,
}: {
  searchParams: Promise<{ pago?: string; mercadopago?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);
  const query = await searchParams;
  const marketplaceCourses = await getPrisma().course.findMany({
    where: { status: "PUBLISHED", creatorId: { not: null } },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      description: true,
      videoUrl: true,
      price: true,
      currency: true,
      pricingType: true,
      coverImageUrl: true,
      creator: { select: { name: true } },
      lessons: {
        where: { isPublished: true },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: { id: true, videoUrl: true },
      },
      modules: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: {
          lessons: {
            where: { isPublished: true },
            orderBy: [{ position: "asc" }, { id: "asc" }],
            select: { id: true, videoUrl: true },
          },
        },
      },
      enrollments: {
        where: {
          studentId: user.id,
          status: "ACTIVE",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: {
          status: true,
          expiresAt: true,
          progress: { where: { completedAt: { not: null } }, select: { id: true } },
        },
      },
    },
  });
  const courseCards = marketplaceCourses.map((course) => {
    const enrollment = course.enrollments[0];
    const enrolled = Boolean(enrollment);
    const completed = enrolled ? enrollment.progress.length : 0;
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      price: course.price.toString(),
      currency: course.currency,
      pricingType: course.pricingType,
      creatorName: course.creator?.name ?? "Creador de Lyra",
      lessonCount: course.lessons.length + course.modules.reduce((total, module) => total + module.lessons.length, 0),
      previewVideoUrl:
        course.modules.flatMap((module) => module.lessons).find((lesson) => lesson.videoUrl)?.videoUrl ??
        course.lessons.find((lesson) => lesson.videoUrl)?.videoUrl ??
        course.videoUrl,
      coverImageUrl: course.coverImageUrl,
      enrolled,
      progress: course.lessons.length || course.modules.some((module) => module.lessons.length)
        ? Math.round(
            (completed /
              (course.lessons.length + course.modules.reduce((total, module) => total + module.lessons.length, 0))) *
              100,
          )
        : 0,
    };
  });

  return (
    <>
      <PageHeader
        eyebrow="Academia"
        title="Marketplace de cursos"
        description="Descubre cursos gratuitos y de pago de la comunidad. Desliza para explorar."
        section="academy"
      />
      {query.pago === "ok" ? (
        <p role="status" className="mb-5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Pago confirmado. Ya tienes acceso al curso.
        </p>
      ) : null}
      {query.pago === "pendiente" ? (
        <p role="status" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Mercado Pago está procesando el pago. El acceso se activará al confirmarse.
        </p>
      ) : null}
      {query.mercadopago === "connected" ? (
        <p role="status" className="mb-5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Cuenta de Mercado Pago conectada.
        </p>
      ) : null}
      {query.mercadopago === "error" || query.mercadopago === "cancelled" ? (
        <p role="alert" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No se completó la conexión de Mercado Pago. Inténtalo nuevamente desde el panel del creador.
        </p>
      ) : null}
      <MarketplaceCourseCatalog courses={courseCards} />
      <section className="mb-10">
        <div className="mb-4">
          <p className="text-sm text-[#8A8680]">Biblioteca LYRA</p>
          <h2 className="mt-1 text-2xl font-semibold text-[#1E1E24]">Cursos gratuitos</h2>
        </div>
        <CourseCatalog courses={courses} />
      </section>
    </>
  );
}
