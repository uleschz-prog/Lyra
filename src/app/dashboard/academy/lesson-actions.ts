"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";

async function activeEnrollment(courseId: string, userId: string) {
  return getPrisma().courseEnrollment.findFirst({
    where: {
      courseId,
      studentId: userId,
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
}

export async function markAcademyLessonComplete(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const courseId = String(formData.get("courseId") ?? "");
  const lessonId = String(formData.get("lessonId") ?? "");
  const [enrollment, lesson] = await Promise.all([
    activeEnrollment(courseId, user.id),
    getPrisma().lesson.findFirst({
      where: { id: lessonId, courseId, isPublished: true },
      select: { id: true },
    }),
  ]);
  if (!enrollment || !lesson) redirect("/dashboard/academy");

  await getPrisma().lessonProgress.upsert({
    where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
    create: { enrollmentId: enrollment.id, lessonId, completedAt: new Date() },
    update: { completedAt: new Date() },
  });
  revalidatePath(`/dashboard/academy/${courseId}`);
  revalidatePath("/dashboard/academy");
}

export async function createAcademyLessonComment(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const courseId = String(formData.get("courseId") ?? "");
  const lessonId = String(formData.get("lessonId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body || body.length > 3000) redirect(`/dashboard/academy/${courseId}?error=comentario`);

  const [enrollment, lesson] = await Promise.all([
    activeEnrollment(courseId, user.id),
    getPrisma().lesson.findFirst({
      where: { id: lessonId, courseId, isPublished: true },
      select: { id: true },
    }),
  ]);
  if (!enrollment || !lesson) redirect("/dashboard/academy");

  await getPrisma().lessonComment.create({ data: { lessonId, userId: user.id, body } });
  revalidatePath(`/dashboard/academy/${courseId}`);
}
