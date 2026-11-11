"use client";

import { Heart } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function CommunityPostLike({
  postId,
  initialLikes,
  initialLiked,
}: {
  postId: string;
  initialLikes: number;
  initialLiked: boolean;
}) {
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(initialLiked);
  const [pending, setPending] = useState(false);

  async function toggleLike() {
    if (pending) return;
    const previous = { likes, liked };
    const nextLiked = !liked;
    setPending(true);
    setLiked(nextLiked);
    setLikes(Math.max(0, likes + (nextLiked ? 1 : -1)));

    try {
      const response = await fetch(`/api/academy/posts/${encodeURIComponent(postId)}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liked: nextLiked }),
      });
      const result = (await response.json()) as { liked?: boolean; likes?: number; error?: string };
      if (!response.ok || typeof result.liked !== "boolean" || typeof result.likes !== "number") {
        throw new Error(result.error ?? "No se pudo actualizar la reacción.");
      }
      setLiked(result.liked);
      setLikes(result.likes);
    } catch (error) {
      setLiked(previous.liked);
      setLikes(previous.likes);
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar la reacción.");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggleLike()}
      disabled={pending}
      aria-pressed={liked}
      aria-label={liked ? "Quitar me gusta" : "Dar me gusta"}
      className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm text-[#6A6662] transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-60"
    >
      <Heart size={17} aria-hidden="true" className={liked ? "fill-rose-500 text-rose-500" : ""} />
      <span>{likes}</span>
    </button>
  );
}
