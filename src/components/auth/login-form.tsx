"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";

const fieldClass =
  "mt-2 h-11 w-full rounded-md border border-[#D9D5CE] bg-white px-3 text-sm text-[#1E1E24] outline-none focus:border-[#7C3AED]";

const passwordClass =
  "h-11 w-full rounded-md border border-[#D9D5CE] bg-white px-3 text-sm text-[#1E1E24] outline-none focus:border-[#7C3AED]";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: form.get("identifier"),
        password: form.get("password"),
      }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setPending(false);
    if (!response.ok) {
      setError(payload?.error ?? "No se pudo iniciar sesión.");
      return;
    }
    router.push(brand.links.dashboard);
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
      <label className="block text-sm text-[#1E1E24]">
        Correo / Usuario
        <input name="identifier" autoComplete="username" required className={fieldClass} />
      </label>
      <label className="block text-sm text-[#1E1E24]">
        Contraseña
        <PasswordField name="password" autoComplete="current-password" required tone="light" className={passwordClass} />
      </label>
      {error ? <p className="text-sm text-[#9F1239]">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Entrando…" : "Entrar al backoffice"}
      </Button>
      <p className="text-center text-sm text-[#8A8680]">
        ¿Aún no tienes cuenta?{" "}
        <Link href={brand.links.register} className="font-medium text-[#7C3AED]">
          Regístrate
        </Link>
      </p>
    </form>
  );
}
