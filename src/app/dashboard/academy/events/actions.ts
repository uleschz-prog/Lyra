"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";

const academyPath = "/dashboard/academy";
const maxDurationMinutes = 24 * 60;

export async function createAcademyEvent(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect(academyPath);

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const startsAtValue = String(formData.get("startsAtUtc") ?? "");
  const durationMinutes = Number(formData.get("durationMinutes") ?? 60);
  const location = String(formData.get("location") ?? "").trim();
  const meetingUrl = String(formData.get("meetingUrl") ?? "").trim();
  const startsAt = new Date(startsAtValue);

  if (
    !title ||
    title.length > 120 ||
    !description ||
    description.length > 2000 ||
    !startsAtValue ||
    !Number.isFinite(startsAt.getTime()) ||
    startsAt <= new Date() ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 15 ||
    durationMinutes > maxDurationMinutes ||
    location.length > 160 ||
    meetingUrl.length > 500
  ) {
    redirect(`${academyPath}?event=invalid`);
  }

  if (meetingUrl) {
    try {
      const url = new URL(meetingUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Invalid URL protocol");
    } catch {
      redirect(`${academyPath}?event=invalid-url`);
    }
  }

  const prisma = getPrisma();
  await prisma.$transaction(async (transaction) => {
    const event = await transaction.academyEvent.create({
      data: {
        title,
        description,
        startsAt,
        durationMinutes,
        location: location || null,
        meetingUrl: meetingUrl || null,
        createdById: user.id,
      },
      select: { id: true, title: true },
    });
    const recipients = await transaction.user.findMany({
      where: {
        id: { not: user.id },
        OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: new Date() } }],
      },
      select: { id: true },
    });
    if (recipients.length) {
      await transaction.academyNotification.createMany({
        data: recipients.map((recipient) => ({
          userId: recipient.id,
          actorId: user.id,
          type: "ACADEMY_EVENT",
          title: "Nuevo evento de Academia",
          body: event.title,
          href: `${academyPath}#event-${event.id}`,
        })),
      });
    }
  });
  revalidatePath(academyPath);
}

export async function rsvpToAcademyEvent(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId || eventId.length > 128) redirect(academyPath);

  const event = await getPrisma().academyEvent.findFirst({
    where: { id: eventId, startsAt: { gt: new Date() } },
    select: { id: true },
  });
  if (!event) redirect(`${academyPath}?event=closed`);

  await getPrisma().academyEventRsvp.upsert({
    where: { eventId_userId: { eventId, userId: user.id } },
    create: { eventId, userId: user.id },
    update: {},
  });
  revalidatePath(academyPath);
}

export async function cancelAcademyEventRsvp(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId || eventId.length > 128) redirect(academyPath);

  await getPrisma().academyEventRsvp.deleteMany({
    where: { eventId, userId: user.id, event: { startsAt: { gt: new Date() } } },
  });
  revalidatePath(academyPath);
}

export async function deleteAcademyEvent(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect(academyPath);

  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId || eventId.length > 128) redirect(academyPath);

  await getPrisma().academyEvent.deleteMany({ where: { id: eventId } });
  revalidatePath(academyPath);
}
