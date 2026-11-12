import type { Metadata } from "next";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { startDirectMessage } from "@/app/dashboard/academy/messages/actions";
import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";
import type { Rank } from "@/lib/types";

export const metadata: Metadata = { title: "Miembros · Academia" };

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

export default async function AcademyMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ buscar?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const query = await searchParams;
  const search = (query.buscar ?? "").trim().slice(0, 40);
  const members = await getPrisma().user.findMany({
    where: {
      id: { not: user.id },
      AND: [
        { OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: new Date() } }] },
        ...(search.length >= 2
          ? [{
              OR: [
                { username: { contains: search.replace(/^@/, ""), mode: "insensitive" as const } },
                { name: { contains: search, mode: "insensitive" as const } },
              ],
            }]
          : []),
      ],
    },
    orderBy: search.length >= 2 ? [{ name: "asc" }, { id: "asc" }] : [{ createdAt: "desc" }, { id: "asc" }],
    take: 24,
    select: { id: true, name: true, username: true, avatar: true, rank: true },
  });

  return (
    <>
      <PageHeader
        eyebrow="Comunidad"
        title="Miembros de LYRA"
        description="Descubre a otras personas de la comunidad y conecta con ellas."
        section="academy"
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard/academy#comunidad" className="text-sm font-medium text-violet-700 hover:text-violet-900">
          ← Volver a la comunidad
        </Link>
        <Link href="/dashboard/academy/mensajes" className="text-sm font-medium text-violet-700 hover:text-violet-900">
          Ver mensajes privados →
        </Link>
      </div>

      <form method="get" className="mb-5 flex gap-2 rounded-2xl border border-border bg-surface p-3">
        <label htmlFor="academy-member-search" className="sr-only">Buscar miembros por nombre o usuario</label>
        <input
          id="academy-member-search"
          name="buscar"
          defaultValue={search}
          maxLength={40}
          placeholder="Buscar por nombre o @usuario"
          className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-white px-3 text-sm text-[#1E1E24] outline-none focus:border-violet-400"
        />
        <button type="submit" aria-label="Buscar miembros" className="grid size-11 shrink-0 place-items-center rounded-xl bg-violet-700 text-white hover:bg-violet-800">
          <Search size={18} aria-hidden="true" />
        </button>
      </form>

      <p className="mb-3 text-xs text-[#8A8680]">
        {search.length >= 2 ? `Resultados para “${search}”` : "Miembros activos recientemente"}
        {" · "}{members.length} {members.length === 1 ? "perfil" : "perfiles"}
      </p>

      {members.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {members.map((member) => (
            <article key={member.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-center gap-3">
                {member.avatar ? (
                  // Avatars are user-provided external URLs.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={member.avatar} alt="" className="size-12 shrink-0 rounded-full object-cover" />
                ) : (
                  <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-violet-100 text-sm font-semibold text-violet-800">
                    {initials(member.name)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <Link href={`/dashboard/academy/miembros/${encodeURIComponent(member.username)}`} className="block truncate text-sm font-semibold text-[#1E1E24] hover:text-violet-800">
                    {member.name}
                  </Link>
                  <p className="truncate text-xs text-[#77716A]">@{member.username}</p>
                  <p className="mt-1 text-[11px] text-violet-800">{rankLabels[member.rank]}</p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Link
                  href={`/dashboard/academy/miembros/${encodeURIComponent(member.username)}`}
                  className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border text-xs font-semibold text-[#312F2F] hover:bg-white"
                >
                  <Users size={14} aria-hidden="true" />Ver perfil
                </Link>
                <form action={startDirectMessage} className="flex-1">
                  <input type="hidden" name="username" value={member.username} />
                  <button type="submit" className="h-9 w-full rounded-xl bg-violet-700 text-xs font-semibold text-white hover:bg-violet-800">
                    Enviar mensaje
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
          <p className="font-medium text-[#312F2F]">No encontramos miembros</p>
          <p className="mt-1 text-sm text-[#77716A]">Prueba con otro nombre o nombre de usuario.</p>
        </div>
      )}
      {!search && members.length === 24 ? (
        <p className="mt-4 text-center text-xs text-[#8A8680]">Mostrando los 24 perfiles más recientes. Busca un nombre para encontrar a alguien en particular.</p>
      ) : null}
    </>
  );
}
