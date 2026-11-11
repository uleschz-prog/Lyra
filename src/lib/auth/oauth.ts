import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

import { isProviderEmailVerified, pickGithubEmail } from "@/lib/auth/oauth-email";

export const oauthProviders = ["google", "github", "apple"] as const;

export type OauthProvider = (typeof oauthProviders)[number];

export type OauthProfile = {
  email: string;
  name: string;
  provider: OauthProvider;
  ref: string;
  idea: string;
  kind: string;
  emailVerified: true;
};

const stateCookie = "lyra_oauth_state";
const profileCookie = "lyra_oauth_profile";

export function isOauthProvider(value: string): value is OauthProvider {
  return oauthProviders.includes(value as OauthProvider);
}

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return new TextEncoder().encode(secret);
}

export function oauthConfigured(provider: OauthProvider) {
  if (provider === "google") {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }
  if (provider === "github") {
    return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
  }
  return Boolean(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET);
}

export function authorizeUrl(provider: OauthProvider, redirectUri: string, state: string) {
  if (provider === "google") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID ?? "");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");
    return url;
  }

  if (provider === "github") {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID ?? "");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "read:user user:email");
    url.searchParams.set("state", state);
    return url;
  }

  const url = new URL("https://appleid.apple.com/auth/authorize");
  url.searchParams.set("client_id", process.env.APPLE_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "form_post");
  url.searchParams.set("scope", "name email");
  url.searchParams.set("state", state);
  return url;
}

export async function exchangeProfile(
  provider: OauthProvider,
  code: string,
  redirectUri: string,
): Promise<{ email: string; name: string }> {
  if (provider === "google") return googleProfile(code, redirectUri);
  if (provider === "github") return githubProfile(code, redirectUri);
  return appleProfile(code, redirectUri);
}

async function googleProfile(code: string, redirectUri: string) {
  const token = await tokenRequest("https://oauth2.googleapis.com/token", {
    code,
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const access = typeof token.access_token === "string" ? token.access_token : "";
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${access}` },
  });
  const profile = (await response.json()) as { email?: string; name?: string; email_verified?: unknown };
  if (!profile.email || !isProviderEmailVerified(profile.email_verified)) {
    throw new Error("Google no confirmó el correo.");
  }
  return { email: profile.email, name: profile.name || profile.email.split("@")[0] || "LYRA" };
}

async function githubProfile(code: string, redirectUri: string) {
  const token = await tokenRequest(
    "https://github.com/login/oauth/access_token",
    {
      code,
      client_id: process.env.GITHUB_CLIENT_ID ?? "",
      client_secret: process.env.GITHUB_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
    },
    { Accept: "application/json" },
  );
  const access = typeof token.access_token === "string" ? token.access_token : "";
  const response = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${access}`, Accept: "application/vnd.github+json" },
  });
  const profile = (await response.json()) as { name?: string | null; login?: string };
  const emails = await fetch("https://api.github.com/user/emails", {
    headers: { Authorization: `Bearer ${access}`, Accept: "application/vnd.github+json" },
  });
  const email = pickGithubEmail(await emails.json());
  if (!email) throw new Error("GitHub no confirmó el correo.");
  return { email, name: profile.name || profile.login || email.split("@")[0] || "LYRA" };
}

async function appleProfile(code: string, redirectUri: string) {
  const token = await tokenRequest("https://appleid.apple.com/auth/token", {
    code,
    client_id: process.env.APPLE_CLIENT_ID ?? "",
    client_secret: process.env.APPLE_CLIENT_SECRET ?? "",
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const idToken = typeof token.id_token === "string" ? token.id_token : "";
  const payload = decodeJwtPayload(idToken);
  const email = typeof payload.email === "string" ? payload.email : "";
  if (!email || !isProviderEmailVerified(payload.email_verified)) {
    throw new Error("Apple no confirmó el correo.");
  }
  return { email, name: email.split("@")[0] || "LYRA" };
}

async function tokenRequest(url: string, body: Record<string, string>, headers?: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(body),
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !payload) throw new Error("El proveedor no completó el acceso.");
  return payload;
}

function decodeJwtPayload(token: string) {
  const part = token.split(".")[1];
  if (!part) return {};
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function writeOauthState(state: string, ref: string, idea = "", kind = "") {
  const cookieStore = await cookies();
  cookieStore.set(
    stateCookie,
    JSON.stringify({ state, ref, idea: idea.slice(0, 240), kind: kind.slice(0, 12) }),
    cookieOptions(60 * 10),
  );
}

export async function readOauthState() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(stateCookie)?.value ?? "";
  try {
    const parsed = JSON.parse(raw) as { state?: string; ref?: string; idea?: string; kind?: string };
    return {
      state: typeof parsed.state === "string" ? parsed.state : "",
      ref: typeof parsed.ref === "string" ? parsed.ref : "LYRA-ROOT",
      idea: typeof parsed.idea === "string" ? parsed.idea.slice(0, 240) : "",
      kind: typeof parsed.kind === "string" ? parsed.kind.slice(0, 12) : "",
    };
  } catch {
    return { state: raw, ref: "LYRA-ROOT", idea: "", kind: "" };
  }
}

export async function clearOauthState() {
  const cookieStore = await cookies();
  cookieStore.delete(stateCookie);
}

export async function writeOauthProfile(profile: OauthProfile) {
  const key = secretKey();
  if (!key) throw new Error("SESSION_SECRET debe tener al menos 32 caracteres.");
  const token = await new SignJWT(profile)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(key);
  const cookieStore = await cookies();
  cookieStore.set(profileCookie, token, cookieOptions(60 * 15));
}

export async function readOauthProfile(): Promise<OauthProfile | null> {
  const key = secretKey();
  if (!key) return null;
  const cookieStore = await cookies();
  const token = cookieStore.get(profileCookie)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (typeof payload.email !== "string" || !isOauthProvider(String(payload.provider))) return null;
    if (payload.emailVerified !== true) return null;
    return {
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : payload.email,
      provider: payload.provider as OauthProvider,
      ref: typeof payload.ref === "string" ? payload.ref : "LYRA-ROOT",
      idea: typeof payload.idea === "string" ? payload.idea.slice(0, 240) : "",
      kind: typeof payload.kind === "string" ? payload.kind.slice(0, 12) : "",
      emailVerified: true,
    };
  } catch {
    return null;
  }
}

export async function clearOauthProfile() {
  const cookieStore = await cookies();
  cookieStore.delete(profileCookie);
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
