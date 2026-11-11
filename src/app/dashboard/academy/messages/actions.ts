"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";

const inboxPath = "/dashboard/academy/mensajes";

export async function startDirectMessage(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const username = String(formData.get("username") ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!username || username.length > 32) redirect(`${inboxPath}?error=member`);

  const recipient = await getPrisma().user.findFirst({
    where: {
      username,
      OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: new Date() } }],
    },
    select: { id: true },
  });
  if (!recipient || recipient.id === user.id) redirect(`${inboxPath}?error=member`);

  const [participantOneId, participantTwoId] = [user.id, recipient.id].sort();
  const conversation = await getPrisma().directMessageConversation.upsert({
    where: { participantOneId_participantTwoId: { participantOneId, participantTwoId } },
    create: { participantOneId, participantTwoId },
    update: {},
    select: { id: true },
  });
  redirect(`${inboxPath}/${conversation.id}`);
}

export async function sendDirectMessage(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const conversationId = String(formData.get("conversationId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!conversationId || conversationId.length > 128 || !body || body.length > 2000) {
    redirect(`${inboxPath}?error=message`);
  }

  const prisma = getPrisma();
  const conversation = await prisma.directMessageConversation.findFirst({
    where: {
      id: conversationId,
      OR: [{ participantOneId: user.id }, { participantTwoId: user.id }],
    },
    select: { id: true, participantOneId: true, participantTwoId: true },
  });
  if (!conversation) redirect(inboxPath);

  const recipientId = conversation.participantOneId === user.id
    ? conversation.participantTwoId
    : conversation.participantOneId;
  await prisma.$transaction([
    prisma.directMessage.create({
      data: { conversationId, senderId: user.id, body },
    }),
    prisma.directMessageConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    }),
    prisma.academyNotification.create({
      data: {
        userId: recipientId,
        actorId: user.id,
        type: "DIRECT_MESSAGE",
        title: "Nuevo mensaje privado",
        body: "Tienes un mensaje nuevo en tu bandeja de Academia.",
        href: `${inboxPath}/${conversationId}`,
      },
    }),
  ]);
  revalidatePath(`${inboxPath}/${conversationId}`);
  revalidatePath(inboxPath);
}
