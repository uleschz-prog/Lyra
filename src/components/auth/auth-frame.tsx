import Link from "next/link";
import type { ReactNode } from "react";

import { LyraLogo } from "@/components/brand/lyra-logo";
import { brand } from "@/config/brand";

export function AuthFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="lyra-office relative min-h-screen overflow-x-hidden px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="relative mx-auto flex w-full max-w-lg flex-col gap-8">
        <Link href={brand.links.home} aria-label="LYRA, ir al inicio" className="w-fit">
          <LyraLogo ink />
        </Link>
        <section className="rounded-2xl border border-border bg-surface/80 p-5 backdrop-blur-xl sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
          <div className="mt-6">{children}</div>
        </section>
      </div>
    </main>
  );
}
