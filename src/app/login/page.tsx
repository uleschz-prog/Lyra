import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthFrame } from "@/components/auth/auth-frame";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth/profile";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "Entrar",
};

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(brand.links.dashboard);

  return (
    <AuthFrame
      title="Entrar a LYRA"
      description="Usa tu correo o tu usuario. La sesión queda en una cookie cifrada."
    >
      <LoginForm />
    </AuthFrame>
  );
}
