import { NextResponse } from "next/server";

import { decryptAcademyCredential, hashAcademyOAuthState } from "@/lib/academy/credentials";
import { exchangeAcademyOAuthCode } from "@/lib/academy/mercadopago";
import { getPrisma } from "@/lib/prisma";

function academyPageUrl(status: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL no está configurada.");
  const target = new URL("/dashboard/academy", appUrl);
  target.searchParams.set("mercadopago", status);
  return target;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (url.searchParams.get("error")) return NextResponse.redirect(academyPageUrl("cancelled"));
  if (!code || code.length > 2048 || !state || state.length > 128) {
    return NextResponse.redirect(academyPageUrl("error"));
  }

  try {
    const prisma = getPrisma();
    const oauthState = await prisma.academyOAuthState.findUnique({
      where: { stateHash: hashAcademyOAuthState(state) },
    });
    if (!oauthState || oauthState.consumedAt || oauthState.expiresAt.getTime() <= Date.now()) {
      return NextResponse.redirect(academyPageUrl("error"));
    }

    const consumed = await prisma.academyOAuthState.updateMany({
      where: { id: oauthState.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) return NextResponse.redirect(academyPageUrl("error"));

    const verifier = decryptAcademyCredential(oauthState.codeVerifierEncrypted);
    const account = await exchangeAcademyOAuthCode(code, verifier);
    await prisma.creatorAccount.upsert({
      where: { userId: oauthState.userId },
      create: {
        userId: oauthState.userId,
        sellerId: account.sellerId,
        siteId: account.siteId,
        accessTokenEncrypted: account.accessTokenEncrypted,
        refreshTokenEncrypted: account.refreshTokenEncrypted,
        tokenExpiresAt: account.tokenExpiresAt,
        status: "connected",
        connectedAt: new Date(),
      },
      update: {
        sellerId: account.sellerId,
        siteId: account.siteId,
        accessTokenEncrypted: account.accessTokenEncrypted,
        refreshTokenEncrypted: account.refreshTokenEncrypted,
        tokenExpiresAt: account.tokenExpiresAt,
        status: "connected",
        connectedAt: new Date(),
      },
    });
    return NextResponse.redirect(academyPageUrl("connected"));
  } catch {
    return NextResponse.redirect(academyPageUrl("error"));
  }
}
