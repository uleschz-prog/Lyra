import { clientIp } from "@/lib/auth/rate-limit";
import { issueRunToken, submitScore, topScores } from "@/lib/games/leaderboard";
import { gameSpaceForSlug } from "@/lib/games/server";
import { applyBatch, authenticate, listChanges, loginWithPin, logout, sessionView } from "@/lib/liveapps/core";
import { bearer, liveCors, liveJson, readJsonBody } from "@/lib/liveapps/http";
import { getPrisma } from "@/lib/prisma";

// Data API de apps publicadas: login (PIN), session, changes (sincronización), batch (escrituras
// atómicas) y logout. Todo se resuelve por el slug publicado; nunca por ids que mande el navegador.
// Modo juego: «scores» (top 10 + ficha de partida) y «score» (guardar puntaje), públicos sin PIN.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Context = { params: Promise<{ slug: string; action: string }> };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: liveCors });
}

async function session(request: Request, slug: string) {
  return authenticate(getPrisma(), { slug, token: bearer(request) });
}

export async function GET(request: Request, context: Context) {
  const { slug, action } = await context.params;
  try {
    if (action === "scores") {
      const space = await gameSpaceForSlug(slug);
      if (!space) return liveJson(404, { ok: false, error: "Este juego no tiene ranking en línea." });
      return liveJson(200, { ok: true, top: await topScores(getPrisma(), space.id), run: issueRunToken(space.id, new Date()) });
    }
    if (action !== "session" && action !== "changes") return liveJson(404, { ok: false, error: "No existe." });
    const auth = await session(request, slug);
    if (!auth.ok) return liveJson(auth.status, auth);
    if (action === "session") return liveJson(200, { ok: true, session: sessionView(auth.ctx.space, auth.ctx.member) });
    const since = new URL(request.url).searchParams.get("since");
    return liveJson(200, { ok: true, ...(await listChanges(getPrisma(), auth.ctx, since ?? "0")) });
  } catch (error) {
    console.error("[apps] GET", action, error);
    return liveJson(500, { ok: false, error: "No pudimos leer los datos. Intenta de nuevo." });
  }
}

export async function POST(request: Request, context: Context) {
  const { slug, action } = await context.params;
  try {
    if (action === "score") {
      const space = await gameSpaceForSlug(slug);
      if (!space) return liveJson(404, { ok: false, error: "Este juego no tiene ranking en línea." });
      const parsed = await readJsonBody(request);
      if (!parsed.ok) return liveJson(parsed.status, parsed);
      const result = await submitScore(getPrisma(), { space, slug: slug.toLowerCase(), ip: clientIp(request), body: parsed.body });
      return liveJson(result.ok ? 200 : result.status, result);
    }
    if (action === "login") {
      const parsed = await readJsonBody(request);
      if (!parsed.ok) return liveJson(parsed.status, parsed);
      const result = await loginWithPin(getPrisma(), { slug, pin: parsed.body.code ?? parsed.body.pin, ip: clientIp(request) });
      return liveJson(result.ok ? 200 : result.status, result);
    }
    if (action !== "batch" && action !== "logout") return liveJson(404, { ok: false, error: "No existe." });
    const auth = await session(request, slug);
    if (!auth.ok) return liveJson(auth.status, auth);
    if (action === "logout") {
      await logout(getPrisma(), auth.ctx);
      return liveJson(200, { ok: true });
    }
    const parsed = await readJsonBody(request);
    if (!parsed.ok) return liveJson(parsed.status, parsed);
    const result = await applyBatch(getPrisma(), auth.ctx, parsed.body.ops);
    return liveJson(result.ok ? 200 : result.status, result);
  } catch (error) {
    console.error("[apps] POST", action, error);
    return liveJson(500, { ok: false, error: "No pudimos guardar. Intenta de nuevo." });
  }
}
