import type { Metadata } from "next";
import Link from "next/link";
import { Bell, CalendarDays, MessageCircle, MessageSquareText, CheckCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { openAcademyNotification, markAllAcademyNotificationsRead } from "@/app/dashboard/academy/notifications/actions";
import { PageHeader } from "@/components/dashboard/page-header";
import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Notificaciones" };

function NotificationIcon({ type }: { type: string }) {
  if (type === "DIRECT_MESSAGE") return <MessageCircle size={18} aria-hidden="true" />;
  if (type === "POST_COMMENT") return <MessageSquareText size={18} aria-hidden="true" />;
  if (type === "ACADEMY_EVENT") return <CalendarDays size={18} aria-hidden="true" />;
  return <Bell size={18} aria-hidden="true" />;
}

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const notifications = await getPrisma().academyNotification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      href: true,
      readAt: true,
      createdAt: true,
      actor: { select: { name: true, username: true } },
    },
  });
  const unreadCount = notifications.filter((notification) => notification.readAt === null).length;

  return (
    <>
      <PageHeader
        eyebrow="Comunidad"
        title="Notificaciones"
        description="Mensajes nuevos, comentarios en tus publicaciones y eventos recientes de Academia."
        section="academy"
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard/academy#comunidad" className="text-sm font-medium text-violet-700 hover:text-violet-900">
          ← Volver a Academia
        </Link>
        {unreadCount ? (
          <form action={markAllAcademyNotificationsRead}>
            <button type="submit" className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-[#312F2F] hover:bg-white">
              <CheckCheck size={15} aria-hidden="true" />Marcar todo como leído
            </button>
          </form>
        ) : null}
      </div>

      {notifications.length ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {notifications.map((notification) => (
            <form key={notification.id} action={openAcademyNotification}>
              <input type="hidden" name="notificationId" value={notification.id} />
              <button
                type="submit"
                className={`flex w-full items-start gap-3 border-b border-border p-4 text-left last:border-b-0 transition hover:bg-white ${notification.readAt ? "" : "bg-violet-50/60"}`}
              >
                <span className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl ${notification.readAt ? "bg-[#F0EEEB] text-[#77716A]" : "bg-violet-100 text-violet-800"}`}>
                  <NotificationIcon type={notification.type} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-sm font-semibold text-[#1E1E24]">{notification.title}</span>
                    <time className="text-[11px] text-[#8A8680]">{notification.createdAt.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}</time>
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-[#625E59]">{notification.body}</span>
                  {notification.actor ? (
                    <span className="mt-1 block text-xs text-[#8A8680]">{notification.actor.name} · @{notification.actor.username}</span>
                  ) : null}
                </span>
                {notification.readAt ? null : <span aria-label="No leída" className="mt-2 size-2 shrink-0 rounded-full bg-violet-600" />}
              </button>
            </form>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-14 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-violet-100 text-violet-800"><Bell size={22} aria-hidden="true" /></span>
          <p className="mt-4 font-medium text-[#312F2F]">Estás al día</p>
          <p className="mt-1 text-sm text-[#77716A]">Aquí aparecerán avisos de tus mensajes, comentarios y eventos.</p>
        </div>
      )}
      {notifications.length === 100 ? (
        <p className="mt-3 text-center text-xs text-[#8A8680]">Mostrando las 100 notificaciones más recientes.</p>
      ) : null}
    </>
  );
}
