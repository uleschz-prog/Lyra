import { NextResponse } from "next/server";

import {
  clearOauthState,
  exchangeProfile,
  isOauthProvider,
  readOauthState,
  writeOauthProfile,
} from "@/lib/auth/oauth";

async function finish(request: Request, providerName: string, code: string, state: string) {
  const current = new URL(request.url);
  const back = new URL("/register", current.origin);
  const saved = await readOauthState();
  await clearOauthState();

  if (!isOauthProvider(providerName) || !code || !state || state !== saved.state) {
    back.searchParams.set("aviso", "sesion");
    return NextResponse.redirect(back);
  }

  try {
    const profile = await exchangeProfile(
      providerName,
      code,
      `${current.origin}/api/auth/oauth/${providerName}/callback`,
    );
    await writeOauthProfile({
      email: profile.email,
      name: profile.name,
      provider: providerName,
      ref: saved.ref,
      idea: saved.idea,
      kind: saved.kind,
    });
    back.searchParams.set("paso", "plan");
    if (saved.idea) back.searchParams.set("idea", saved.idea);
    if (saved.kind) back.searchParams.set("tipo", saved.kind);
    return NextResponse.redirect(back);
  } catch {
    back.searchParams.set("aviso", providerName);
    return NextResponse.redirect(back);
  }
}

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  const current = new URL(request.url);
  return finish(
    request,
    provider.toLowerCase(),
    current.searchParams.get("code") ?? "",
    current.searchParams.get("state") ?? "",
  );
}

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  const form = await request.formData().catch(() => null);
  return finish(
    request,
    provider.toLowerCase(),
    String(form?.get("code") ?? ""),
    String(form?.get("state") ?? ""),
  );
}
