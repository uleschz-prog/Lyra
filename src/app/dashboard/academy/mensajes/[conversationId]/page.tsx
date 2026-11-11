import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { sendDirectMessage } from "@/app/dashboard/academy/messages/actions";
import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Conversación · Academia" };

export default async function DirectMessageConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [{ conversationId }, query] = await Promise.all([params, searchParams]);
  const conversation = await getPrisma().directMessageConversation.findFirst({
    where: {
      id: conversationId,
      OR: [{ participantOneId: user.id }, { participantTwoId: user.id }],
    },
    select: {
      participantOneId: true,
      participantOne: { select: { id: true, name: true, username: true, avatar: true } },
      participantTwo: { select: { id: true, name: true, username: true, avatar: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 100,
        select: { id: true, senderId: true, body: true, createdAt: true },
      },
    },
  });
  if (!conversation) notFound();

  const member = conversation.participantOneId === user.id ? conversation.participantTwo : conversation.participantOne;
  return (
    <section className="mx-auto max-w-3xl">
      <Link href="/dashboard/academy/mensajes" className="inline-flex items-center gap-2 text-sm font-medium text-violet-700 hover:text-violet-900">
        <ArrowLeft size={16} aria-hidden="true" />Todas las conversaciones
      </Link>
      <header className="mt-5 flex items-center gap-3 rounded-t-2xl border border-border bg-surface p-4">
        {member.avatar ? (
          // Avatars are user-provided external URLs.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={member.avatar} alt="" className="size-11 rounded-full object-cover" />
        ) : (
          <span aria-hidden="true" className="grid size-11 place-items-center rounded-full bg-violet-100 text-xs font-semibold text-violet-800">
            {member.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase()}
          </span>
        )}
        <div>
          <h1 className="text-base font-semibold text-[#1E1E24]">{member.name}</h1>
          <p className="text-xs text-[#8A8680]">@{member.username}</p>
        </div>
      </header>

      <div className="max-h-[60vh] min-h-64 space-y-3 overflow-y-auto border-x border-border bg-white p-4 sm:p-6" aria-live="polite">
        {conversation.messages.length ? conversation.messages.map((message) => {
          const own = message.senderId === user.id;
          return (
            <article key={message.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${own ? "rounded-br-md bg-violet-700 text-white" : "rounded-bl-md bg-[#F3F1EE] text-[#312F2F]"}`}>
                <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>
                <time className={`mt-1 block text-right text-[10px] ${own ? "text-white/70" : "text-[#8A8680]"}`}>
                  {message.createdAt.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                </time>
              </div>
            </article>
          );
        }) : (
          <p className="py-16 text-center text-sm text-[#77716A]">Saluda a {member.name} para comenzar.</p>
        )}
      </div>

      {query.error === "message" ? (
        <p role="alert" className="border-x border-border bg-red-50 px-4 py-2 text-sm text-red-800">
          El mensaje no puede estar vacío ni superar 2,000 caracteres.
        </p>
      ) : null}

      <form action={sendDirectMessage} className="flex items-end gap-2 rounded-b-2xl border border-border bg-surface p-3 sm:p-4">
        <input type="hidden" name="conversationId" value={conversationId} />
        <label htmlFor="direct-message-body" className="sr-only">Escribe un mensaje privado</label>
        <textarea
          id="direct-message-body"
          name="body"
          required
          maxLength={2000}
          rows={2}
          placeholder="Escribe un mensaje..."
          className="min-h-12 min-w-0 flex-1 resize-y rounded-xl border border-border bg-white px-3 py-3 text-sm leading-6 text-[#1E1E24] outline-none focus:border-violet-400"
        />
        <button type="submit" aria-label="Enviar mensaje" className="grid size-12 shrink-0 place-items-center rounded-xl bg-violet-700 text-white transition hover:bg-violet-800">
          <Send size={17} aria-hidden="true" />
        </button>
      </form>
      <p className="mt-2 text-right text-[11px] text-[#8A8680]">Mensajes privados · Máximo 2,000 caracteres</p>
    </section>
  );
}
