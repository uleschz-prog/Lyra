import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";

export function OnboardingFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main
      className="grid min-h-screen place-items-center px-4 py-10"
      style={{
        backgroundColor: "#E6EDF8",
        backgroundImage: "radial-gradient(#c9d4e8 1.1px, transparent 1.1px)",
        backgroundSize: "14px 14px",
      }}
    >
      <section className="w-full max-w-[520px] bg-white px-6 py-10 shadow-[0_12px_40px_rgba(40,60,110,0.08)] sm:px-8">
        <div className="flex justify-center">
          <Logo compact ink />
        </div>
        <h1 className="mt-6 text-center text-[1.7rem] font-semibold tracking-tight text-[#1E1E24]">{title}</h1>
        {children}
      </section>
    </main>
  );
}
