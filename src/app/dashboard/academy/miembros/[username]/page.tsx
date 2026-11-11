import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { startDirectMessage } from "@/app/dashboard/academy/messages/actions";
import { PageHeader } from "@/components/dashboard/page-header";
import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";
import type { Rank } from "@/lib/types";

export const metadata: Metadata = { title: "Perfil de miembro · Academia" };

const rankLabels: Record<Rank, string> = {
  ASTRA: "Astra",
  NOVA: "Nova",
  ALPHA: "Alpha",
  PULSAR: "Pulsar",
  VEGA: "Vega",
  CONSTELLATION: "Constelación",
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

export default async function AcademyMemberProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { username: rawUsername } = await params;
  const username = rawUsername.replace(/^@/, "").slice(0, 32);
  const member = await getPrisma().user.findFirst({
    where: {
      username: { equals: username, mode: "insensitive" },
      OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: new Date() } }],
    },
    select: {
      id: true,
      name: true,
      username: true,
      avatar: true,
      rank: true,
      createdAt: true,
      academyPosts: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          body: true,
          createdAt: true,
          _count: { select: { likes: true, comments: true } },
        },
      },
    },
  });
  if (!member || member.id === user.id) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Comunidad"
        title="Perfil de miembro"
        description="Conoce a esta persona a través de su perfil y sus publicaciones públicas en la comunidad."
        section="academy"
      />
      <Link href="/dashboard/academy/miembros" className="inline-flex items-center gap-2 text-sm font-medium text-violet-700 hover:text-violet-900">
        <ArrowLeft size={16} aria-hidden="true" />Directorio de miembros
      </Link>

      <section className="my-5 rounded-2xl border border-border bg-surface p-5 sm:p-7">
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          {member.avatar ? (
            // Avatars are user-provided external URLs.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.avatar} alt="" className="size-20 rounded-full object-cover" />
          ) : (
            <span aria-hidden="true" className="grid size-20 place-items-center rounded-full bg-violet-100 text-xl font-semibold text-violet-800">
              {initials(member.name)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-2xl font-semibold text-[#1E1E24]">{member.name}</h2>
            <p className="mt-1 text-sm text-[#77716A]">@{member.username}</p>
            <p className="mt-2 text-xs font-medium text-violet-800">{rankLabels[member.rank]} · Miembro desde {member.createdAt.toLocaleDateString("es-MX", { month: "long", year: "numeric" })}</p>
          </div>
          <form action={startDirectMessage}>
            <input type="hidden" name="username" value={member.username} />
            <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800">
              <MessageCircle size={16} aria-hidden="true" />Enviar mensaje
            </button>
          </form>
        </div>
      </section>

      <section aria-labelledby="member-public-posts">
        <h2 id="member-public-posts" className="mb-3 text-lg font-semibold text-[#1E1E24]">Publicaciones en la comunidad</h2>
        {member.academyPosts.length ? (
          <div className="space-y-3">
            {member.academyPosts.map((post) => (
              <article key={post.id} className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-[#312F2F]">{post.body}</p>
                <div className="mt-3 flex items-center gap-4 border-t border-border pt-3 text-xs text-[#8A8680]">
                  <time>{post.createdAt.toLocaleDateString("es-MX", { dateStyle: "long" })}</time>
                  <span>{post._count.likes} me gusta</span>
                  <span>{post._count.comments} comentarios</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-border bg-surface px-5 py-8 text-center text-sm text-[#77716A]">
            Este miembro todavía no tiene publicaciones en la comunidad.
          </p>
        )}
      </section>
    </>
  );
}
