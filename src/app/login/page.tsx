import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthFrame } from "@/components/auth/auth-frame";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth/profile";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(brand.links.dashboard);

  return (
    <AuthFrame
      title="Iniciar sesión"
      description="Usa tu correo o tu usuario y tu contraseña."
    >
      <LoginForm />
    </AuthFrame>
  );
}
