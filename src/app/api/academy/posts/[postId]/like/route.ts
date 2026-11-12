import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";

export async function POST(request: Request, context: { params: Promise<{ postId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para reaccionar." }, { status: 401 });

  const { postId } = await context.params;
  const body = (await request.json().catch(() => null)) as { liked?: unknown } | null;
  if (!postId || postId.length > 128 || typeof body?.liked !== "boolean") {
    return NextResponse.json({ error: "Solicitud de reacción no válida." }, { status: 400 });
  }

  const prisma = getPrisma();
  const post = await prisma.academyPost.findUnique({ where: { id: postId }, select: { id: true } });
  if (!post) return NextResponse.json({ error: "La publicación ya no está disponible." }, { status: 404 });

  if (body.liked) {
    await prisma.academyPostLike.upsert({
      where: { postId_userId: { postId, userId: user.id } },
      create: { postId, userId: user.id },
      update: {},
    });
  } else {
    await prisma.academyPostLike.deleteMany({ where: { postId, userId: user.id } });
  }

  const [likes, liked] = await Promise.all([
    prisma.academyPostLike.count({ where: { postId } }),
    prisma.academyPostLike.findUnique({
      where: { postId_userId: { postId, userId: user.id } },
      select: { id: true },
    }),
  ]);
  return NextResponse.json(
    { liked: Boolean(liked), likes },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
