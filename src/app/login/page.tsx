import type { Metadata } from "next";

import { AuthFrame } from "@/components/auth/auth-frame";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

export default function LoginPage() {
  return (
    <AuthFrame
      title="Iniciar sesión"
      description="Usa tu correo o tu usuario y tu contraseña."
    >
      <LoginForm />
    </AuthFrame>
  );
}
