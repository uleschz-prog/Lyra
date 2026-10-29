import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para ordenar el curso." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { courseId?: unknown; kind?: unknown; parentId?: unknown; itemIds?: unknown }
    | null;
  const courseId = typeof body?.courseId === "string" ? body.courseId : "";
  const parentId = typeof body?.parentId === "string" ? body.parentId : "";
  const itemIds = Array.isArray(body?.itemIds) ? body.itemIds : [];
  if (
    !courseId ||
    (body?.kind !== "module" && body?.kind !== "lesson") ||
    itemIds.length > 100 ||
    itemIds.some((id) => typeof id !== "string" || id.length > 128) ||
    new Set(itemIds).size !== itemIds.length
  ) {
    return NextResponse.json({ error: "Orden de contenido no válido." }, { status: 400 });
  }

  const prisma = getPrisma();
  const course = await prisma.course.findFirst({
    where: { id: courseId, creatorId: user.id },
    select: { id: true },
  });
  if (!course) return NextResponse.json({ error: "No se encontró el curso." }, { status: 404 });

  const records =
    body.kind === "module"
      ? await prisma.courseModule.findMany({ where: { courseId }, select: { id: true } })
      : await prisma.lesson.findMany({
          where: { moduleId: parentId, courseId },
          select: { id: true },
        });
  if (
    (body.kind === "lesson" && !parentId) ||
    records.length !== itemIds.length ||
    records.some((record) => !itemIds.includes(record.id))
  ) {
    return NextResponse.json({ error: "La lista cambió; recarga antes de reordenar." }, { status: 409 });
  }

  await prisma.$transaction(
    itemIds.map((id, position) =>
      body.kind === "module"
        ? prisma.courseModule.update({ where: { id }, data: { position } })
        : prisma.lesson.update({ where: { id }, data: { position } }),
    ),
  );
  return NextResponse.json({ ok: true });
}
