"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";

const academyPath = "/dashboard/academy";

export async function createAcademyPost(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const body = String(formData.get("body") ?? "").trim();
  if (!body || body.length > 2000) redirect(`${academyPath}?community=post-error`);

  await getPrisma().academyPost.create({
    data: { userId: user.id, body },
  });
  revalidatePath(academyPath);
}

export async function createAcademyPostComment(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const postId = String(formData.get("postId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!postId || postId.length > 128 || !body || body.length > 1200) {
    redirect(`${academyPath}?community=comment-error`);
  }

  const post = await getPrisma().academyPost.findUnique({
    where: { id: postId },
    select: { id: true, userId: true },
  });
  if (!post) redirect(academyPath);

  const prisma = getPrisma();
  await prisma.$transaction([
    prisma.academyPostComment.create({
      data: { postId, userId: user.id, body },
    }),
    ...(post.userId !== user.id
      ? [
          prisma.academyNotification.create({
            data: {
              userId: post.userId,
              actorId: user.id,
              type: "POST_COMMENT",
              title: "Nuevo comentario en tu publicación",
              body: body.slice(0, 180),
              href: `${academyPath}#comunidad`,
            },
          }),
        ]
      : []),
  ]);
  revalidatePath(academyPath);
}

export async function deleteAcademyPost(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const postId = String(formData.get("postId") ?? "");
  if (!postId || postId.length > 128) redirect(academyPath);

  const result = await getPrisma().academyPost.deleteMany({
    where: { id: postId, ...(user.role === "ADMIN" ? {} : { userId: user.id }) },
  });
  if (result.count) revalidatePath(academyPath);
}

export async function deleteAcademyPostComment(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const commentId = String(formData.get("commentId") ?? "");
  if (!commentId || commentId.length > 128) redirect(academyPath);

  const result = await getPrisma().academyPostComment.deleteMany({
    where: { id: commentId, ...(user.role === "ADMIN" ? {} : { userId: user.id }) },
  });
  if (result.count) revalidatePath(academyPath);
}
