import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/profile";
import type { AuthProfile } from "@/lib/types";

export type ApiGuard = { ok: true; user: AuthProfile } | { ok: false; response: NextResponse };

export async function requireMember(): Promise<ApiGuard> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 }) };
  }
  if (user.role !== "ADMIN" && (!user.package || user.package === "NONE")) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Activa tu membresía para usar las herramientas de IA." }, { status: 403 }),
    };
  }
  return { ok: true, user };
}
