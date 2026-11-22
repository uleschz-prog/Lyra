"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth/profile";
import { gameSpaceSchema, resetScores } from "@/lib/games/leaderboard";
import { ownedSpace } from "@/lib/liveapps/core";
import { getPrisma } from "@/lib/prisma";

type Result = { ok: true; removed: number } | { ok: false; error: string };

/** Borra todos los puntajes del ranking en línea de un juego del socio. */
export async function resetRankingAction(projectId: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Inicia sesión para continuar." };
  const db = getPrisma();
  const space = await ownedSpace(db, user.id, projectId);
  if (!space || !gameSpaceSchema(space.schema)) return { ok: false, error: "Este juego todavía no tiene ranking." };
  const removed = await resetScores(db, space.id);
  revalidatePath(`/dashboard/proyectos/${projectId}`);
  return { ok: true, removed };
}
