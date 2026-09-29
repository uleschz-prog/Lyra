"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth/profile";
import { monthFromKey } from "@/lib/compensation/activity";
import { closeMonth } from "@/lib/compensation/close";

export async function closeMonthAction(key: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return { ok: false as const, error: "Solo la cuenta administradora cierra el mes." };
  }
  const month = monthFromKey(key);
  if (!month) return { ok: false as const, error: "Mes inválido." };

  const result = await closeMonth(month);
  revalidatePath("/dashboard", "layout");
  return result;
}
