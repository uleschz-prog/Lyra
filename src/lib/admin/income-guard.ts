// Acceso a la API de Ingresos: solo ADMIN; las escrituras exigen JSON del mismo origen (sin CSRF por formularios).
import { getCurrentUser } from "@/lib/auth/profile";
import type { IncomeAdmin } from "@/lib/admin/income";

export async function incomeAdmin(): Promise<{ ok: true; admin: IncomeAdmin } | { ok: false; response: Response }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, response: Response.json({ error: "Inicia sesión." }, { status: 401 }) };
  if (user.role !== "ADMIN") return { ok: false, response: Response.json({ error: "Solo la cuenta administradora puede ver los ingresos." }, { status: 403 }) };
  return { ok: true, admin: { id: user.id, name: user.name, email: user.email } };
}

export function writeAllowed(request: Request): Response | null {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Formato no válido." }, { status: 415 });
  }
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(request.url).host) return Response.json({ error: "Origen no permitido." }, { status: 403 });
    } catch {
      return Response.json({ error: "Origen no permitido." }, { status: 403 });
    }
  }
  return null;
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text().catch(() => "");
  if (!text || text.length > 10_000) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const noStore = { "cache-control": "no-store" };
