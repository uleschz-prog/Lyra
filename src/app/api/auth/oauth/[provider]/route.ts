import { NextResponse } from "next/server";

import { authorizeUrl, isOauthProvider, oauthConfigured, writeOauthState } from "@/lib/auth/oauth";

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider: raw } = await context.params;
  const provider = raw.toLowerCase();
  const current = new URL(request.url);
  const back = new URL("/register", current.origin);
  const ref = current.searchParams.get("ref");
  const idea = current.searchParams.get("idea");
  const kind = current.searchParams.get("tipo");
  if (ref) back.searchParams.set("ref", ref);
  if (idea) back.searchParams.set("idea", idea);
  if (kind) back.searchParams.set("tipo", kind);

  if (!isOauthProvider(provider) || !oauthConfigured(provider)) {
    back.searchParams.set("aviso", provider);
    return NextResponse.redirect(back);
  }

  const state = crypto.randomUUID();
  await writeOauthState(state, ref?.trim() || "LYRA-ROOT", idea?.trim() || "", kind?.trim() || "");
  const redirectUri = `${current.origin}/api/auth/oauth/${provider}/callback`;
  return NextResponse.redirect(authorizeUrl(provider, redirectUri, state));
}
