"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/utils";

export function SignOutButton({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={pending}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm text-[#9F1239] transition hover:border-[#9F1239]/30 hover:bg-[#9F1239]/8 disabled:opacity-50",
        className,
      )}
    >
      <LogOut className="h-4 w-4 shrink-0" aria-hidden />
      <span className={compact ? "max-[380px]:sr-only" : undefined}>
        {pending ? "Cerrando…" : "Cerrar sesión"}
      </span>
    </button>
  );
}
