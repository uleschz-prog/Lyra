import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const tones = {
  violet: "bg-[#EDE9FE] text-[#7C3AED]",
  cyan: "bg-[#CFFAFE] text-[#0891B2]",
  emerald: "bg-[#D1FAE5] text-[#059669]",
  amber: "bg-[#FEF3C7] text-[#B45309]",
};

export function StatLink({
  href,
  label,
  icon: Icon,
  tone = "violet",
  children,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  tone?: keyof typeof tones;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-[#E7E2DA] bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-[#C4B5FD] hover:shadow-[0_10px_30px_rgba(124,58,237,0.08)]"
    >
      <div className="flex items-center justify-between">
        <span className={cn("grid h-9 w-9 place-items-center rounded-xl", tones[tone])}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <ArrowRight className="h-4 w-4 text-[#C9C4BC] transition-transform group-hover:translate-x-0.5 group-hover:text-[#7C3AED]" aria-hidden />
      </div>
      <p className="mt-5 text-[11px] tracking-[0.16em] text-[#8A8680] uppercase">{label}</p>
      {children}
    </Link>
  );
}
