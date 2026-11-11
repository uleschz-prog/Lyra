import { MessageCircle, Send } from "lucide-react";

import { createAcademyPost, createAcademyPostComment, deleteAcademyPost, deleteAcademyPostComment } from "@/app/dashboard/academy/community-actions";
import { CommunityPostLike } from "@/components/academy/community-post-like";

type CommunityPostData = {
  id: string;
  body: string;
  createdAt: Date;
  author: { id: string; name: string; username: string; avatar: string | null };
  comments: Array<{
    id: string;
    body: string;
    createdAt: Date;
    author: { id: string; name: string; username: string; avatar: string | null };
  }>;
  likes: Array<{ userId: string }>;
  _count: { likes: number; comments: number };
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function Avatar({ name, avatar }: { name: string; avatar: string | null }) {
  return avatar ? (
    // User avatars may be hosted outside the app.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatar} alt="" className="size-10 rounded-full object-cover" />
  ) : (
    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-semibold text-violet-800">
      {initials(name)}
    </span>
  );
}

export function CommunityWall({
  posts,
  userId,
  isAdmin,
}: {
  posts: CommunityPostData[];
  userId: string;
  isAdmin: boolean;
}) {
  return (
    <section className="mb-12 scroll-mt-6" id="comunidad" aria-labelledby="academy-community-title">
      <div className="mb-5">
        <p className="text-sm font-medium text-violet-700">Aprendemos en comunidad</p>
        <h2 id="academy-community-title" className="mt-1 text-2xl font-semibold text-[#1E1E24]">Comunidad LYRA</h2>
        <p className="mt-1 max-w-2xl text-sm text-[#6A6662]">Comparte avances, preguntas e ideas con otros miembros de la Academia.</p>
      </div>

      <form action={createAcademyPost} className="mb-5 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <label htmlFor="academy-post-body" className="sr-only">Escribe una publicación para la comunidad</label>
        <textarea
          id="academy-post-body"
          name="body"
          required
          maxLength={2000}
          rows={3}
          placeholder="¿Qué estás aprendiendo o creando?"
          className="w-full resize-y rounded-xl border border-border bg-white px-4 py-3 text-sm leading-6 text-[#1E1E24] outline-none transition placeholder:text-[#99948D] focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-[#8A8680]">Hasta 2,000 caracteres</span>
          <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white transition hover:bg-violet-800">
            <Send size={15} aria-hidden="true" />Publicar
          </button>
        </div>
      </form>

      <div className="space-y-4">
        {posts.length ? posts.map((post) => {
          const canDeletePost = isAdmin || post.author.id === userId;
          return (
            <article key={post.id} className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
              <header className="flex items-start gap-3">
                <Avatar name={post.author.name} avatar={post.author.avatar} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#1E1E24]">{post.author.name}</p>
                  <p className="mt-0.5 text-xs text-[#8A8680]">@{post.author.username} · {formatDate(post.createdAt)}</p>
                </div>
                {canDeletePost ? (
                  <form action={deleteAcademyPost}>
                    <input type="hidden" name="postId" value={post.id} />
                    <button type="submit" className="rounded-lg px-2 py-1 text-xs text-[#77716A] hover:bg-red-50 hover:text-red-700">Eliminar</button>
                  </form>
                ) : null}
              </header>

              <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-[#312F2F]">{post.body}</p>

              <div className="mt-3 flex items-center gap-2 border-b border-border pb-3">
                <CommunityPostLike postId={post.id} initialLikes={post._count.likes} initialLiked={post.likes.length > 0} />
                <span className="inline-flex items-center gap-2 px-3 py-2 text-sm text-[#6A6662]">
                  <MessageCircle size={17} aria-hidden="true" />{post._count.comments}
                </span>
              </div>

              <div className="mt-3 space-y-3">
                {post.comments.map((comment) => (
                  <div key={comment.id} className="flex items-start gap-2.5">
                    <Avatar name={comment.author.name} avatar={comment.author.avatar} />
                    <div className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-xs font-semibold text-[#1E1E24]">{comment.author.name}</span>
                          <span className="ml-2 text-[10px] text-[#99948D]">{formatDate(comment.createdAt)}</span>
                        </div>
                        {isAdmin || comment.author.id === userId ? (
                          <form action={deleteAcademyPostComment}>
                            <input type="hidden" name="commentId" value={comment.id} />
                            <button type="submit" aria-label="Eliminar comentario" className="text-[11px] text-[#8A8680] hover:text-red-700">Eliminar</button>
                          </form>
                        ) : null}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[#4A4642]">{comment.body}</p>
                    </div>
                  </div>
                ))}

                <form action={createAcademyPostComment} className="flex items-start gap-2.5 pt-1">
                  <Avatar name="Tú" avatar={null} />
                  <input type="hidden" name="postId" value={post.id} />
                  <label htmlFor={`comment-${post.id}`} className="sr-only">Escribe un comentario</label>
                  <textarea
                    id={`comment-${post.id}`}
                    name="body"
                    required
                    maxLength={1200}
                    rows={1}
                    placeholder="Escribe un comentario..."
                    className="min-h-10 min-w-0 flex-1 resize-y rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-[#1E1E24] outline-none placeholder:text-[#99948D] focus:border-violet-400"
                  />
                  <button type="submit" aria-label="Enviar comentario" className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#312F2F] text-white transition hover:bg-violet-800">
                    <Send size={15} aria-hidden="true" />
                  </button>
                </form>
              </div>
            </article>
          );
        }) : (
          <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center">
            <p className="font-medium text-[#312F2F]">Sé parte de la primera conversación</p>
            <p className="mt-1 text-sm text-[#77716A]">Comparte una pregunta o cuéntanos qué estás aprendiendo.</p>
          </div>
        )}
      </div>
    </section>
  );
}
