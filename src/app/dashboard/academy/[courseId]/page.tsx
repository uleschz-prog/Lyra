import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { brand } from "@/config/brand";
import { academyVideoEmbed } from "@/lib/academy/video";
import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";
import { createAcademyLessonComment, markAcademyLessonComplete } from "../lesson-actions";

export const metadata: Metadata = { title: "Curso · Academia" };

export default async function AcademyCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);
  const { courseId } = await params;
  const course = await getPrisma().course.findFirst({
    where: { id: courseId, status: "PUBLISHED" },
    include: {
      creator: { select: { name: true } },
      modules: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        include: {
          lessons: {
            where: { isPublished: true },
            orderBy: [{ position: "asc" }, { id: "asc" }],
            include: {
              attachments: { orderBy: [{ position: "asc" }, { id: "asc" }] },
              comments: { orderBy: { createdAt: "asc" }, include: { user: { select: { name: true } } } },
            },
          },
        },
      },
      lessons: {
        where: { isPublished: true, moduleId: null },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        include: {
          attachments: { orderBy: [{ position: "asc" }, { id: "asc" }] },
          comments: { orderBy: { createdAt: "asc" }, include: { user: { select: { name: true } } } },
        },
      },
      enrollments: {
        where: {
          studentId: user.id,
          status: "ACTIVE",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        include: { progress: { where: { completedAt: { not: null } }, select: { lessonId: true } } },
        take: 1,
      },
    },
  });
  if (!course) notFound();
  const enrollment = course.enrollments[0];
  if (!enrollment) redirect("/dashboard/academy");
  const done = new Set(enrollment.progress.map((item) => item.lessonId));
  const lessons = [
    ...course.modules.flatMap((module) => module.lessons.map((lesson) => ({ ...lesson, moduleTitle: module.title }))),
    ...course.lessons.map((lesson) => ({ ...lesson, moduleTitle: "Lecciones" })),
  ];
  const progress = lessons.length ? Math.round((done.size / lessons.length) * 100) : 0;

  return (
    <>
      <PageHeader
        eyebrow="Academia"
        title={course.title}
        description={`Por ${course.creator?.name ?? "Creador de Lyra"} · ${progress}% completado`}
        section="academy"
      />
      <div className="mb-6 h-2 overflow-hidden rounded-full bg-surface-hover">
        <div className="h-full rounded-full bg-[#06B6D4]" style={{ width: `${progress}%` }} />
      </div>
      {lessons.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-[#6A6662]">
          Este curso todavía no tiene lecciones publicadas.
        </p>
      ) : (
        <div className="space-y-6">
          {lessons.map((lesson, index) => {
            const video = academyVideoEmbed(lesson.videoUrl);
            return (
              <article key={lesson.id} className="rounded-2xl border border-border bg-surface p-5">
                <p className="text-xs uppercase tracking-wide text-[#8A8680]">
                  {lesson.moduleTitle} · Lección {index + 1}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-[#1E1E24]">{lesson.title}</h2>
                {lesson.description ? <p className="mt-2 text-sm text-[#6A6662]">{lesson.description}</p> : null}
                {video?.kind === "embed" ? (
                  <iframe
                    className="mt-4 aspect-video w-full rounded-xl bg-black"
                    src={video.url}
                    title={lesson.title}
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                ) : video?.kind === "video" ? (
                  <video className="mt-4 aspect-video w-full rounded-xl bg-black" controls preload="metadata" src={video.url}>
                    Tu navegador no puede reproducir este video.
                  </video>
                ) : null}
                {lesson.content ? (
                  <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[#312F2F]">{lesson.content}</div>
                ) : null}
                {lesson.attachments.length ? (
                  <div className="mt-4 border-t border-border pt-3">
                    <h3 className="text-sm font-medium text-[#1E1E24]">Materiales</h3>
                    <ul className="mt-2 space-y-1">
                      {lesson.attachments.map((file) => (
                        <li key={file.id}>
                          <a
                            href={file.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-[#5C5854] underline underline-offset-4"
                          >
                            {file.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {!done.has(lesson.id) ? (
                  <form action={markAcademyLessonComplete} className="mt-4">
                    <input type="hidden" name="courseId" value={course.id} />
                    <input type="hidden" name="lessonId" value={lesson.id} />
                    <button className="rounded-lg bg-[#312F2F] px-3 py-2 text-sm font-medium text-white hover:bg-[#1E1E24]">
                      Marcar como completada
                    </button>
                  </form>
                ) : (
                  <p className="mt-4 text-sm font-medium text-emerald-700">Lección completada</p>
                )}

                <section className="mt-6 border-t border-border pt-4">
                  <h3 className="text-sm font-semibold text-[#1E1E24]">Comentarios de la lección</h3>
                  <ul className="mt-3 space-y-3">
                    {lesson.comments.map((comment) => (
                      <li key={comment.id} className="rounded-lg bg-white p-3">
                        <p className="text-xs font-medium text-[#5C5854]">{comment.user.name}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-[#312F2F]">{comment.body}</p>
                      </li>
                    ))}
                  </ul>
                  <form action={createAcademyLessonComment} className="mt-3 space-y-2">
                    <input type="hidden" name="courseId" value={course.id} />
                    <input type="hidden" name="lessonId" value={lesson.id} />
                    <textarea
                      name="body"
                      required
                      maxLength={3000}
                      rows={2}
                      placeholder="Escribe una pregunta o comentario"
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-[#1E1E24]"
                    />
                    <button className="rounded-lg border border-border px-3 py-2 text-sm text-[#312F2F] hover:bg-surface-hover">
                      Comentar
                    </button>
                  </form>
                </section>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
