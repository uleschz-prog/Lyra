import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CommunityWall } from "@/components/academy/community-wall";
import { CommunityEvents } from "@/components/academy/community-events";
import { PageHeader } from "@/components/dashboard/page-header";
import { MarketplaceCourseCatalog } from "@/components/academy/marketplace-course-catalog";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Academia",
};

export default async function AcademyPage({
  searchParams,
}: {
  searchParams: Promise<{ pago?: string; mercadopago?: string; community?: string; event?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);
  const query = await searchParams;
  const prisma = getPrisma();
  const [marketplaceCourses, communityPosts, upcomingEvents] = await Promise.all([
    prisma.course.findMany({
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
        _count: { select: { likes: true } },
        likes: {
          where: { userId: user.id },
          select: { id: true },
        },
      },
    }),
    prisma.academyPost.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { id: true, name: true, username: true, avatar: true } },
        comments: {
          orderBy: { createdAt: "desc" },
          take: 4,
          select: {
            id: true,
            body: true,
            createdAt: true,
            author: { select: { id: true, name: true, username: true, avatar: true } },
          },
        },
        likes: {
          where: { userId: user.id },
          select: { userId: true },
        },
        _count: { select: { likes: true, comments: true } },
      },
    }),
    prisma.academyEvent.findMany({
      where: { startsAt: { gt: new Date() } },
      orderBy: { startsAt: "asc" },
      take: 8,
      select: {
        id: true,
        title: true,
        description: true,
        startsAt: true,
        durationMinutes: true,
        location: true,
        meetingUrl: true,
        rsvps: {
          where: { userId: user.id },
          select: { id: true },
        },
        _count: { select: { rsvps: true } },
      },
    }),
  ]);
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
      likes: course._count.likes,
      likedByUser: course.likes.length > 0,
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
        title="Catálogo de cursos"
        description="Descubre cursos publicados por la comunidad o crea los tuyos desde el panel del creador."
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
      {query.community === "post-error" ? (
        <p role="alert" className="mb-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          Escribe una publicación de hasta 2,000 caracteres.
        </p>
      ) : null}
      {query.community === "comment-error" ? (
        <p role="alert" className="mb-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          Escribe un comentario de hasta 1,200 caracteres.
        </p>
      ) : null}
      {query.event === "invalid" || query.event === "invalid-url" ? (
        <p role="alert" className="mb-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          Revisa el título, descripción, fecha futura, duración de 15 a 1,440 minutos y el enlace del evento.
        </p>
      ) : null}
      {query.event === "closed" ? (
        <p role="alert" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Ya no se puede confirmar asistencia a ese evento.
        </p>
      ) : null}
      <CommunityEvents
        isAdmin={user.role === "ADMIN"}
        events={upcomingEvents.map((event) => ({
          id: event.id,
          title: event.title,
          description: event.description,
          startsAt: event.startsAt,
          durationMinutes: event.durationMinutes,
          location: event.location,
          meetingUrl: event.meetingUrl,
          attendeeCount: event._count.rsvps,
          attending: event.rsvps.length > 0,
        }))}
      />
      <div className="mb-6 flex flex-wrap justify-end gap-2">
        <Link href="/dashboard/academy/miembros" className="inline-flex h-10 items-center rounded-xl border border-border bg-surface px-4 text-sm font-medium text-[#312F2F] transition hover:bg-white">
          Directorio de miembros
        </Link>
        <Link href="/dashboard/academy/mensajes" className="inline-flex h-10 items-center rounded-xl border border-border bg-surface px-4 text-sm font-medium text-[#312F2F] transition hover:bg-white">
          Mensajes privados
        </Link>
      </div>
      <CommunityWall posts={communityPosts} userId={user.id} isAdmin={user.role === "ADMIN"} />
      <MarketplaceCourseCatalog courses={courseCards} />
    </>
  );
}
