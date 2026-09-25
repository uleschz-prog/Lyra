"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

import { PasswordField } from "@/components/auth/password-field";
import { Logo } from "@/components/brand/logo";
import { signupPlans, type SignupPlanId } from "@/config/compensation-plan";
import { brand } from "@/config/brand";

const notices: Record<string, string> = {
  google: "Google todavía no está conectado. Crea la cuenta con tu correo.",
  github: "GitHub todavía no está conectado. Crea la cuenta con tu correo.",
  apple: "Apple todavía no está conectado. Crea la cuenta con tu correo.",
  sesion: "Ese acceso expiró. Vuelve a elegir el proveedor.",
  correo: "El proveedor no verificó ese correo. Confírmalo en Google, GitHub o Apple antes de entrar.",
};

function planFromIdea(idea: string): SignupPlanId | null {
  const text = idea.toLowerCase();
  if (/founder|1000/.test(text)) return "FOUNDER";
  if (/\bpro\b|499/.test(text)) return "PRO";
  if (/started|\b99\b/.test(text)) return "STARTED";
  return null;
}

function usernameFromEmail(email: string) {
  const local = email.split("@")[0] ?? "lyra";
  let slug = local
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length < 3) slug = `${slug}lyra`;
  return slug.slice(0, 24);
}

function nameFromEmail(email: string) {
  const local = email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "Miembro LYRA";
  return local.length >= 2 ? local.slice(0, 80) : "Miembro LYRA";
}

export function RegisterForm({
  refCode,
  idea = "",
  kind = "",
  aviso = "",
  social = null,
  activation = null,
  activationError = "",
}: {
  refCode: string;
  idea?: string;
  kind?: string;
  aviso?: string;
  social?: { email: string; name: string } | null;
  activation?: { code: string; packageId: SignupPlanId } | null;
  activationError?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(social ? 2 : 1);
  const [packageId, setPackageId] = useState<SignupPlanId | null>(activation?.packageId ?? planFromIdea(idea));
  const [error, setError] = useState(activationError || notices[aviso] || "");
  const prepaid = activation ? signupPlans.find((plan) => plan.id === activation.packageId) : null;
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState(social?.email ?? "");
  const [password, setPassword] = useState("");
  const ready = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && password.length >= 8;

  function continueToPackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;
    setError("");
    if (activation) {
      void submitRegistration();
      return;
    }
    setStep(2);
  }

  async function submitRegistration() {
    if (!packageId) {
      setError("Elige un plan para abrir la cuenta.");
      return;
    }
    setPending(true);
    setError("");
    const response = await fetch(social ? "/api/auth/oauth/finish" : "/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        social
          ? { packageId, idea, kind }
          : {
              name: nameFromEmail(email),
              email,
              username: usernameFromEmail(email),
              password,
              confirmPassword: password,
              packageId,
              ref: refCode,
              idea,
              kind,
              code: activation?.code ?? "",
            },
      ),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string; checkout?: string | null } | null;
    if (!response.ok) {
      setPending(false);
      setError(payload?.error ?? "No se pudo crear la cuenta.");
      return;
    }
    if (payload?.checkout) {
      window.location.href = payload.checkout;
      return;
    }
    setPending(false);
    router.push(brand.links.dashboard);
    router.refresh();
  }

  const socialHref = (provider: string) => {
    const params = new URLSearchParams({ ref: refCode });
    if (idea) params.set("idea", idea);
    if (kind) params.set("tipo", kind);
    return `/api/auth/oauth/${provider}?${params.toString()}`;
  };

  return (
    <div>
      <div className="flex justify-center">
        <Logo compact ink />
      </div>
      <h1 className="mt-6 text-center text-[2rem] font-semibold tracking-tight text-[#1E1E24]">
        {step === 1 ? "Crea tu cuenta" : "Elige tu plan"}
      </h1>
      {idea ? <p className="mt-3 text-center text-sm text-[#252525]">Vas a construir: {idea}</p> : null}
      {social && step === 2 ? (
        <p className="mt-3 text-center text-sm text-[#252525]">{social.email}</p>
      ) : null}

      {prepaid ? (
        <p className="mt-4 rounded-md border border-[#7C3AED]/30 bg-[#F5F3FF] px-4 py-3 text-center text-sm text-[#1E1E24]">
          Tu membresía <span className="font-medium">{prepaid.label}</span> ya está pagada. Solo crea tu cuenta.
        </p>
      ) : null}

      {step === 1 ? (
        <>
          {prepaid ? (
            <div className="mt-8" />
          ) : (
            <>
              <div className="mt-8 space-y-3">
                <SocialLink href={socialHref("google")} label="Registrarse con Google">
                  <GoogleMark />
                </SocialLink>
                <SocialLink href={socialHref("github")} label="Registrarse con GitHub">
                  <GithubMark />
                </SocialLink>
                <SocialLink href={socialHref("apple")} label="Registrarse con Apple">
                  <AppleMark />
                </SocialLink>
              </div>

              <div className="my-6 flex items-center gap-3 text-[#C8C8C8]">
                <span className="h-px flex-1 bg-[#E6E6E6]" />
                <span className="grid h-6 w-6 place-items-center rounded-full border border-[#E6E6E6] text-xs text-[#8A8680]">
                  o
                </span>
                <span className="h-px flex-1 bg-[#E6E6E6]" />
              </div>
            </>
          )}

          <form onSubmit={continueToPackage} className="space-y-4">
            <label className="block text-sm font-medium text-[#1E1E24]">
              Correo electrónico
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Ingresa tu correo electrónico"
                autoComplete="email"
                className="mt-2 h-12 w-full rounded-md border border-[#D9D5CE] px-3 text-sm font-normal text-[#0F0F0F] outline-none placeholder:text-[#B0B0B0] focus:border-[#312F2F]"
              />
            </label>
            <label className="block text-sm font-medium text-[#1E1E24]">
              Contraseña
              <PasswordField
                name="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Ingresa tu contraseña"
                autoComplete="new-password"
                tone="light"
                className="h-12 w-full rounded-md border border-[#D9D5CE] px-3 text-sm font-normal text-[#0F0F0F] outline-none placeholder:text-[#B0B0B0] focus:border-[#312F2F]"
              />
            </label>
            {error ? <p className="text-sm text-[#9A3B2F]">{error}</p> : null}
            <button
              type="submit"
              disabled={!ready}
              className={`h-12 w-full rounded-md text-sm font-medium ${
                ready ? "bg-[#312F2F] text-white" : "cursor-default bg-[#E7E7E7] text-[#A3A3A3]"
              }`}
            >
              Registrarse
            </button>
          </form>
        </>
      ) : (
        <>
        <p className="mt-6 text-center text-sm leading-relaxed text-[#5C5854]">
          Elige la membresía de entrada. Pagas con Mercado Pago (tarjeta, OXXO o saldo) y tu cuenta se activa al acreditarse. La recarga de créditos, si aplica, empieza al mes siguiente.
        </p>
        <div className="mt-6 space-y-3">
          {signupPlans.map((planPackage) => {
            const selected = packageId === planPackage.id;
            const featured = planPackage.id === "FOUNDER";
            return (
              <button
                key={planPackage.id}
                type="button"
                onClick={() => setPackageId(planPackage.id)}
                className={`w-full rounded-md border px-4 py-4 text-left ${
                  selected
                    ? featured
                      ? "border-[#7C3AED] bg-[#F5F3FF]"
                      : "border-[#312F2F] bg-[#F7F4EF]"
                    : "border-[#D9D5CE] bg-white"
                }`}
              >
                <span className="flex items-end justify-between gap-3">
                  <span>
                    <span className="block text-sm font-medium text-[#1E1E24]">{planPackage.label}</span>
                    <span className="mt-1 block text-xs text-[#8A8680]">{planPackage.subtitle}</span>
                  </span>
                  <span className="text-sm text-[#252525]">
                    ${planPackage.price}
                  </span>
                </span>
                <ul className="mt-3 space-y-1">
                  {planPackage.points.map((point) => (
                    <li key={point} className="text-xs leading-relaxed text-[#5C5854]">
                      {point}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
          {error ? <p className="text-sm text-[#9A3B2F]">{error}</p> : null}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="h-12 rounded-md border border-[#D9D5CE] px-4 text-sm text-[#1E1E24]"
            >
              Volver
            </button>
            <button
              type="button"
              disabled={pending || !packageId}
              onClick={() => void submitRegistration()}
              className="h-12 flex-1 rounded-md bg-[#312F2F] text-sm font-medium text-white disabled:bg-[#E7E7E7] disabled:text-[#A3A3A3]"
            >
              {pending ? "Preparando tu pago…" : "Crear cuenta y pagar"}
            </button>
          </div>
        </div>
        </>
      )}

      <p className="mt-8 text-center text-sm text-[#8A8680]">
        ¿Ya tienes una cuenta de LYRA?{" "}
        <Link href={brand.links.login} className="font-medium text-[#1E1E24] underline">
          Iniciar sesión
        </Link>
      </p>
    </div>
  );
}

function SocialLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-md border border-[#D9D5CE] text-sm font-medium text-[#1E1E24] hover:bg-[#F7F4EF]"
    >
      {children}
      {label}
    </Link>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#1E1E24"
        d="M12 11.2v2.9h6.6c-.3 1.6-1.9 4.6-6.6 4.6-4 0-7.2-3.3-7.2-7.3S8 4.1 12 4.1c2.3 0 3.8 1 4.7 1.8l2-1.9C17 2.3 14.7 1.2 12 1.2 6.2 1.2 1.5 6 1.5 11.8S6.2 22.4 12 22.4c6.1 0 10.1-4.3 10.1-10.3 0-.7-.1-1.2-.2-1.8H12z"
      />
    </svg>
  );
}

function GithubMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-[#1E1E24]" aria-hidden>
      <path d="M12 2C6.5 2 2 6.6 2 12.2c0 4.5 2.9 8.3 6.9 9.6.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.2-3.4-1.2-.4-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.4 9.4 0 0 1 5 0c2-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.6 5 .4.3.7 1 .7 2v3c0 .3.2.6.7.5 4-1.3 6.9-5.1 6.9-9.6C22 6.6 17.5 2 12 2z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-[#1E1E24]" aria-hidden>
      <path d="M16.4 12.6c0-2.2 1.8-3.2 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.3-.1-2.6.8-3.3.8s-1.7-.8-2.9-.8c-1.5 0-2.8.9-3.6 2.2-1.5 2.7-.4 6.6 1.1 8.8.7 1.1 1.6 2.3 2.7 2.2 1.1 0 1.5-.7 2.8-.7s1.7.7 2.9.7 1.9-1.1 2.6-2.1c.8-1.2 1.2-2.3 1.2-2.4-.1 0-2.2-.9-2.2-3.7zM14.7 6.4c.6-.7 1-1.7.9-2.7-.9 0-1.9.6-2.5 1.3-.6.6-1.1 1.6-.9 2.6 1 .1 1.9-.5 2.5-1.2z" />
    </svg>
  );
}
