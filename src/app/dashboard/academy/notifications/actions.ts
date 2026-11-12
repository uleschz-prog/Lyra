"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";

const notificationsPath = "/dashboard/notificaciones";

export async function openAcademyNotification(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const notificationId = String(formData.get("notificationId") ?? "");
  if (!notificationId || notificationId.length > 128) redirect(notificationsPath);

  const notification = await getPrisma().academyNotification.findFirst({
    where: { id: notificationId, userId: user.id },
    select: { id: true, href: true },
  });
  if (!notification) redirect(notificationsPath);

  await getPrisma().academyNotification.updateMany({
    where: { id: notification.id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath(notificationsPath);

  const destination = notification.href.startsWith("/dashboard/academy")
    ? notification.href
    : "/dashboard/academy";
  redirect(destination);
}

export async function markAllAcademyNotificationsRead() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await getPrisma().academyNotification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath(notificationsPath);
  revalidatePath("/dashboard");
}
