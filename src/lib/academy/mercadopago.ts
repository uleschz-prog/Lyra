import { randomBytes } from "node:crypto";

import {
  createAcademyPkcePair,
  decryptAcademyCredential,
  encryptAcademyCredential,
} from "@/lib/academy/credentials";
import { getPrisma } from "@/lib/prisma";

const API = "https://api.mercadopago.com";

export function academyMarketplaceEnabled() {
  return process.env.ACADEMY_MARKETPLACE_ENABLED?.trim().toLowerCase() === "true";
}

type OAuthToken = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user_id?: number | string;
};

type MercadoPagoError = { message?: string; error?: string };

function appCredentials() {
  const clientId = process.env.MERCADOPAGO_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.MERCADOPAGO_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) {
    throw new Error("Faltan las credenciales OAuth de la aplicación de Mercado Pago.");
  }
  return { clientId, clientSecret };
}

export function academyMercadoPagoRedirectUri() {
  const configured = process.env.ACADEMY_MP_REDIRECT_URI?.trim();
  if (configured) return configured;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) throw new Error("Configura ACADEMY_MP_REDIRECT_URI para conectar vendedores.");
  return new URL("/api/academy/mercadopago/callback", appUrl).toString();
}

function academyAppUrl() {
  const value = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!value) throw new Error("NEXT_PUBLIC_APP_URL no está configurada.");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("NEXT_PUBLIC_APP_URL debe usar HTTPS.");
  }
  return parsed.origin;
}

export function createAcademyOAuthAuthorization() {
  const { clientId } = appCredentials();
  const redirectUri = academyMercadoPagoRedirectUri();
  const state = randomBytes(32).toString("base64url");
  const { verifier, challenge } = createAcademyPkcePair();
  const authUrl = new URL("https://auth.mercadopago.com/authorization");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("platform_id", "mp");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "offline_access");
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  return { state, verifier, url: authUrl.toString() };
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as (T & MercadoPagoError) | null;
  if (!response.ok || !data) {
    const message = data?.message ?? data?.error ?? `Mercado Pago respondió ${response.status}.`;
    throw new Error(message);
  }
  return data;
}

export async function exchangeAcademyOAuthCode(code: string, verifier: string) {
  const { clientId, clientSecret } = appCredentials();
  const token = await requestJson<OAuthToken>("/oauth/token", {
    method: "POST",
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: academyMercadoPagoRedirectUri(),
      code_verifier: verifier,
    }),
  });
  if (!token.access_token || !token.user_id) {
    throw new Error("Mercado Pago no devolvió una cuenta de vendedor válida.");
  }

  const profile = await requestJson<{ id?: number | string; site_id?: string }>("/users/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!profile.id || String(profile.id) !== String(token.user_id) || !profile.site_id) {
    throw new Error("No pudimos verificar la cuenta de vendedor autorizada.");
  }

  return {
    sellerId: String(profile.id),
    siteId: profile.site_id,
    accessTokenEncrypted: encryptAcademyCredential(token.access_token),
    refreshTokenEncrypted: token.refresh_token ? encryptAcademyCredential(token.refresh_token) : null,
    tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
  };
}

export async function getAcademySellerToken(account: {
  id: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: Date | null;
}) {
  const expiresSoon = account.tokenExpiresAt && account.tokenExpiresAt.getTime() < Date.now() + 5 * 60_000;
  if (!expiresSoon) return decryptAcademyCredential(account.accessTokenEncrypted);
  if (!account.refreshTokenEncrypted) {
    throw new Error("La autorización de Mercado Pago venció. Vuelve a conectar tu cuenta.");
  }

  const { clientId, clientSecret } = appCredentials();
  const refreshed = await requestJson<OAuthToken>("/oauth/token", {
    method: "POST",
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decryptAcademyCredential(account.refreshTokenEncrypted),
    }),
  });
  if (!refreshed.access_token || !refreshed.refresh_token) {
    throw new Error("Mercado Pago no pudo renovar la autorización del vendedor.");
  }
  const updated = await getPrisma().creatorAccount.update({
    where: { id: account.id },
    data: {
      accessTokenEncrypted: encryptAcademyCredential(refreshed.access_token),
      refreshTokenEncrypted: encryptAcademyCredential(refreshed.refresh_token),
      tokenExpiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null,
      status: "connected",
    },
    select: { accessTokenEncrypted: true },
  });
  return decryptAcademyCredential(updated.accessTokenEncrypted);
}

export async function createAcademyMarketplacePreference(input: {
  accessToken: string;
  sellerId: string;
  externalReference: string;
  courseId: string;
  courseTitle: string;
  buyerId: string;
  creatorId: string;
  price: number;
  fee: number;
  currency: string;
}) {
  const origin = academyAppUrl();
  const preference = await requestJson<{
    id?: string;
    init_point?: string;
    marketplace?: string;
    marketplace_fee?: number | string;
    collector_id?: number | string;
  }>("/checkout/preferences", {
    method: "POST",
    headers: { Authorization: `Bearer ${input.accessToken}` },
    body: JSON.stringify({
      items: [
        {
          id: input.courseId,
          title: input.courseTitle.slice(0, 250),
          quantity: 1,
          unit_price: input.price,
          currency_id: input.currency,
        },
      ],
      marketplace_fee: input.fee,
      external_reference: input.externalReference,
      metadata: {
        lyra_academy: true,
        course_id: input.courseId,
        buyer_id: input.buyerId,
        creator_id: input.creatorId,
      },
      statement_descriptor: "LYRA ACADEMY",
      back_urls: {
        success: `${origin}/api/academy/mercadopago/return?external_reference=${encodeURIComponent(input.externalReference)}`,
        pending: `${origin}/api/academy/mercadopago/return?external_reference=${encodeURIComponent(input.externalReference)}`,
        failure: `${origin}/api/academy/mercadopago/return?external_reference=${encodeURIComponent(input.externalReference)}`,
      },
      auto_return: "approved",
      notification_url: `${origin}/api/academy/mercadopago/webhook?external_reference=${encodeURIComponent(input.externalReference)}`,
    }),
  });
  if (
    !preference.id ||
    !preference.init_point ||
    !preference.marketplace?.startsWith("MP-MKT-") ||
    String(preference.collector_id) !== input.sellerId ||
    Math.round(Number(preference.marketplace_fee) * 100) !== Math.round(input.fee * 100)
  ) {
    throw new Error("Mercado Pago no confirmó el marketplace, el vendedor y la comisión del 7%.");
  }
  return preference;
}

export async function getAcademyMercadoPagoPayment(id: string, accessToken: string) {
  if (!/^\d{1,20}$/.test(id)) return null;
  return requestJson<{
    id: number | string;
    status: string;
    status_detail?: string;
    transaction_amount: number;
    transaction_amount_refunded?: number;
    currency_id: string;
    external_reference: string;
    collector_id?: number | string;
  }>(`/v1/payments/${id}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function academyReturnUrl(status: string) {
  const url = new URL("/dashboard/academy", academyAppUrl());
  url.searchParams.set("pago", status);
  return url;
}
