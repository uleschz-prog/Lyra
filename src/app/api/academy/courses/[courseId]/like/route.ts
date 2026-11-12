import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";

export async function POST(request: Request, context: { params: Promise<{ courseId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para dar me gusta." }, { status: 401 });

  const { courseId } = await context.params;
  const body = (await request.json().catch(() => null)) as { liked?: unknown } | null;
  if (typeof body?.liked !== "boolean" || !courseId || courseId.length > 128) {
    return NextResponse.json({ error: "Solicitud de me gusta no válida." }, { status: 400 });
  }

  const prisma = getPrisma();
  const course = await prisma.course.findFirst({
    where: { id: courseId, status: "PUBLISHED" },
    select: { id: true },
  });
  if (!course) return NextResponse.json({ error: "El curso ya no está disponible." }, { status: 404 });

  if (body.liked) {
    await prisma.academyCourseLike.upsert({
      where: { courseId_userId: { courseId, userId: user.id } },
      create: { courseId, userId: user.id },
      update: {},
    });
  } else {
    await prisma.academyCourseLike.deleteMany({
      where: { courseId, userId: user.id },
    });
  }

  const [likes, liked] = await Promise.all([
    prisma.academyCourseLike.count({ where: { courseId } }),
    prisma.academyCourseLike.findUnique({
      where: { courseId_userId: { courseId, userId: user.id } },
      select: { id: true },
    }),
  ]);
  return NextResponse.json({ liked: Boolean(liked), likes }, { headers: { "Cache-Control": "private, no-store" } });
}
