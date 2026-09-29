"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCredits, initials, packageLabel, rankLabel } from "@/lib/format";
import type { AuthProfile } from "@/lib/types";

export function UserNav({ user }: { user: AuthProfile }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-[#F4F1EC] text-xs text-[#1E1E24] outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/50">
        {initials(user.name)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="px-3 py-2">
          <p className="text-sm text-[#1E1E24]">{user.name}</p>
          <p className="text-xs text-[#8A8680]">@{user.username}</p>
          <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-[#7C3AED]">
            {rankLabel[user.rank]}
            {user.fastTrack ? " · fast-track" : ""}
          </p>
        </div>
        <div className="mx-2 my-1 border-t border-border" />
        <div className="px-3 py-2 text-xs text-[#5C5854]">
          <p>Créditos de IA · {formatCredits(user.credits)}</p>
          <p className="mt-1">Plan · {packageLabel[user.package]}</p>
        </div>
        <DropdownMenuItem
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
          className="text-[#9F1239] focus:bg-[#F4F1EC] focus:text-[#9F1239]"
        >
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
