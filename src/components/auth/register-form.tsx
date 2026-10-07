"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { PasswordField } from "@/components/auth/password-field";
import { Logo } from "@/components/brand/logo";
import { signupPlans, type SignupPlanId } from "@/config/compensation-plan";
import { brand } from "@/config/brand";

const notices: Record<string, string> = {
  google: "Google todavía no está conectado. Crea la cuenta con tu correo.",
  github: "GitHub todavía no está conectado. Crea la cuenta con tu correo.",
  apple: "Apple todavía no está conectado. Crea la cuenta con tu correo.",
  sesion: "Ese acceso expiró. Vuelve a elegir el proveedor.",
};

const usernamePattern = /^[a-z0-9](?:[a-z0-9-]{1,22}[a-z0-9])$/;

function nameFromUsername(username: string) {
  const name = username.trim().replace(/-+/g, " ").replace(/\s+/g, " ");
  return name.length >= 2 ? name.slice(0, 80) : "Miembro LYRA";
}

export function RegisterForm({
  refCode,
  aviso = "",
  social = null,
  activation = null,
  activationError = "",
}: {
  refCode: string;
  aviso?: string;
  social?: { email: string; name: string } | null;
  activation?: { code: string; packageId: SignupPlanId } | null;
  activationError?: string;
}) {
  const [error, setError] = useState(activationError || notices[aviso] || "");
  const prepaid = activation ? signupPlans.find((plan) => plan.id === activation.packageId) : null;
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState(social?.email ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const startedSocial = useRef(false);
  const ready =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && usernamePattern.test(username) && password.length >= 8 && password.length <= 72;

  async function submitRegistration() {
    setPending(true);
    setError("");
    const response = await fetch(social ? "/api/auth/oauth/finish" : "/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        social
          ? { packageId: activation?.packageId ?? "" }
          : {
              name: nameFromUsername(username),
              email,
              username,
              password,
              confirmPassword: password,
              packageId: activation?.packageId ?? "",
              ref: refCode,
              code: activation?.code ?? "",
            },
      ),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string; next?: string; checkout?: string | null } | null;
    if (!response.ok) {
      setPending(false);
      setError(payload?.error ?? "No se pudo crear la cuenta.");
      return;
    }
    if (payload?.checkout) {
      window.location.href = payload.checkout;
      return;
    }
    window.location.href = payload?.next ?? "/pago";
  }

  useEffect(() => {
    if (!social || startedSocial.current) return;
    startedSocial.current = true;
    void submitRegistration();
    // Un acceso social que ya empezó termina solo y sigue al pago.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [social]);

  function continueToAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;
    void submitRegistration();
  }

  return (
    <div>
      <div className="flex justify-center">
        <Logo compact ink />
      </div>
      <h1 className="mt-6 text-center text-[2rem] font-semibold tracking-tight text-[#1E1E24]">
        {social ? "Creando tu cuenta" : "Crea tu cuenta"}
      </h1>
      {social ? <p className="mt-3 text-center text-sm text-[#252525]">{social.email}</p> : null}

      {prepaid ? (
        <p className="mt-4 rounded-md border border-[#7C3AED]/30 bg-[#F5F3FF] px-4 py-3 text-center text-sm text-[#1E1E24]">
          Tu membresía <span className="font-medium">{prepaid.label}</span> ya está pagada. Solo crea tu cuenta.
        </p>
      ) : null}

      {social ? (
        <p className="mt-8 text-center text-sm text-[#5C5854]">{pending ? "Preparando tu cuenta…" : error || "Un momento."}</p>
      ) : (
        <form onSubmit={continueToAccount} className="mt-8 space-y-4">
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
            Nombre de usuario
            <input
              type="text"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/\s+/g, ""))}
              placeholder="Ingresa tu nombre de usuario"
              autoComplete="username"
              minLength={3}
              maxLength={24}
              className="mt-2 h-12 w-full rounded-md border border-[#D9D5CE] px-3 text-sm font-normal text-[#0F0F0F] outline-none placeholder:text-[#B0B0B0] focus:border-[#312F2F]"
            />
          </label>
          <p className="-mt-2 text-xs text-[#8A8680]">Minúsculas, números y guiones, de 3 a 24 caracteres.</p>
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
            disabled={!ready || pending}
            className={`h-12 w-full rounded-md text-sm font-medium ${
              ready && !pending ? "bg-[#312F2F] text-white" : "cursor-default bg-[#E7E7E7] text-[#A3A3A3]"
            }`}
          >
            {pending ? "Creando tu cuenta…" : "Registrarse"}
          </button>
        </form>
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
