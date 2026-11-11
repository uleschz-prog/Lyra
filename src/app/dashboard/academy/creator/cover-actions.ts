"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth/profile";
import { lyraOfficialCourseIds } from "@/lib/academy/constants";
import { getPrisma } from "@/lib/prisma";

export async function removeAcademyCourseCover(courseId: string) {
  const user = await getCurrentUser();
  if (!user || !courseId || courseId.length > 128) return { ok: false, error: "No autorizado." };

  const isOfficialAdminCourse = user.role === "ADMIN" && lyraOfficialCourseIds.includes(
    courseId as (typeof lyraOfficialCourseIds)[number],
  );
  const course = await getPrisma().course.findFirst({
    where: {
      id: courseId,
      ...(isOfficialAdminCourse ? {} : { creatorId: user.id }),
    },
    select: { id: true },
  });
  if (!course) return { ok: false, error: "No tienes permiso para cambiar esta portada." };

  await getPrisma().course.update({ where: { id: courseId }, data: { coverImageUrl: null } });
  revalidatePath("/dashboard/academy/creator");
  revalidatePath("/dashboard/academy");
  return { ok: true };
}
