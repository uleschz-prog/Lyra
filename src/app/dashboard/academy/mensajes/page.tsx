import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, Search } from "lucide-react";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { startDirectMessage } from "@/app/dashboard/academy/messages/actions";
import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Mensajes privados · Academia" };

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

export default async function AcademyMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ buscar?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const query = await searchParams;
  const search = (query.buscar ?? "").trim().slice(0, 40);
  const prisma = getPrisma();
  const conversations = await prisma.directMessageConversation.findMany({
    where: { OR: [{ participantOneId: user.id }, { participantTwoId: user.id }] },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      participantOneId: true,
      participantOne: { select: { id: true, name: true, username: true, avatar: true } },
      participantTwo: { select: { id: true, name: true, username: true, avatar: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, createdAt: true } },
    },
  });
  const members = search.length >= 2
    ? await prisma.user.findMany({
        where: {
          id: { not: user.id },
          AND: [
            { OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: new Date() } }] },
            {
              OR: [
                { username: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
              ],
            },
          ],
        },
        orderBy: { name: "asc" },
        take: 20,
        select: { id: true, name: true, username: true, avatar: true },
      })
    : [];

  return (
    <>
      <PageHeader
        eyebrow="Academia"
        title="Mensajes privados"
        description="Conversa directamente con otros miembros de la comunidad LYRA."
        section="academy"
      />
      <div className="mb-6">
        <Link href="/dashboard/academy#comunidad" className="text-sm font-medium text-violet-700 hover:text-violet-900">
          ← Volver a la comunidad
        </Link>
        <Link href="/dashboard/academy/miembros" className="text-sm font-medium text-violet-700 hover:text-violet-900">
          Directorio de miembros →
        </Link>
      </div>

      {query.error === "member" ? (
        <p role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No encontramos ese miembro. Busca por nombre de usuario o nombre visible.
        </p>
      ) : null}
      {query.error === "message" ? (
        <p role="alert" className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          El mensaje no puede estar vacío ni superar 2,000 caracteres.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
        <section aria-labelledby="academy-inbox-title">
          <h2 id="academy-inbox-title" className="mb-3 text-lg font-semibold text-[#1E1E24]">Tus conversaciones</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {conversations.length ? conversations.map((conversation) => {
              const member = conversation.participantOneId === user.id ? conversation.participantTwo : conversation.participantOne;
              const latestMessage = conversation.messages[0];
              return (
                <Link
                  key={conversation.id}
                  href={`/dashboard/academy/mensajes/${conversation.id}`}
                  className="flex items-center gap-3 border-b border-border p-4 last:border-b-0 hover:bg-white"
                >
                  {member.avatar ? (
                    // Avatars are user-provided external URLs.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={member.avatar} alt="" className="size-11 rounded-full object-cover" />
                  ) : (
                    <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-semibold text-violet-800">{initials(member.name)}</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[#1E1E24]">{member.name} <span className="font-normal text-[#8A8680]">@{member.username}</span></span>
                    <span className="mt-1 block truncate text-sm text-[#6A6662]">{latestMessage?.body ?? "Inicia la conversación"}</span>
                  </span>
                  {latestMessage ? <time className="shrink-0 text-[11px] text-[#8A8680]">{latestMessage.createdAt.toLocaleDateString("es-MX")}</time> : null}
                </Link>
              );
            }) : (
              <p className="px-5 py-10 text-center text-sm text-[#77716A]">Todavía no tienes mensajes. Busca un miembro para iniciar una conversación.</p>
            )}
          </div>
        </section>

        <section aria-labelledby="academy-find-members-title">
          <h2 id="academy-find-members-title" className="mb-3 text-lg font-semibold text-[#1E1E24]">Encontrar miembros</h2>
          <form method="get" className="flex gap-2 rounded-2xl border border-border bg-surface p-3">
            <label htmlFor="member-search" className="sr-only">Buscar miembros</label>
            <input
              id="member-search"
              name="buscar"
              defaultValue={search}
              minLength={2}
              maxLength={40}
              placeholder="Nombre o @usuario"
              className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-white px-3 text-sm text-[#1E1E24] outline-none focus:border-violet-400"
            />
            <button type="submit" aria-label="Buscar" className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-700 text-white hover:bg-violet-800">
              <Search size={17} aria-hidden="true" />
            </button>
          </form>

          <div className="mt-3 space-y-2">
            {members.map((member) => (
              <article key={member.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
                {member.avatar ? (
                  // Avatars are user-provided external URLs.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={member.avatar} alt="" className="size-10 rounded-full object-cover" />
                ) : (
                  <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-semibold text-violet-800">{initials(member.name)}</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[#1E1E24]">{member.name}</span>
                  <span className="block truncate text-xs text-[#8A8680]">@{member.username}</span>
                </span>
                <form action={startDirectMessage}>
                  <input type="hidden" name="username" value={member.username} />
                  <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-[#312F2F] hover:bg-white">
                    <MessageCircle size={14} aria-hidden="true" />Mensaje
                  </button>
                </form>
              </article>
            ))}
            {search.length >= 2 && !members.length ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-[#77716A]">No encontramos miembros con esa búsqueda.</p>
            ) : null}
            {search.length < 2 ? (
              <p className="px-1 pt-2 text-xs leading-5 text-[#8A8680]">Escribe al menos dos caracteres para buscar por nombre o nombre de usuario.</p>
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}
