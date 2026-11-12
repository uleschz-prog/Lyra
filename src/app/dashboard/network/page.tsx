import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ReferralCard } from "@/components/dashboard/referral-card";
import { GenealogyTree } from "@/components/network/genealogy-tree";
import { PartnerProgress } from "@/components/network/partner-progress";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { monthStart, nextMonthStart } from "@/lib/compensation/activity";
import { loadNetwork, networkTree } from "@/lib/compensation/members";

export const metadata: Metadata = {
  title: "Partners",
};

export default async function NetworkPage() {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);

  const { users, depth, members } = await loadNetwork(user.id);
  const root = networkTree(user.id, users, depth);
  const totalPartners = Math.max(0, users.length - 1);
  const directPartners = root?.children.length ?? 0;
  const activePartners = members.filter((member) => member.status === "ACTIVE" && member.id !== user.id).length;
  const currentMonth = monthStart();
  const joinedThisMonth = users.filter(
    (member) => member.sponsorId === user.id && member.createdAt >= currentMonth && member.createdAt < nextMonthStart(currentMonth),
  ).length;
  const maxDepth = Math.max(0, ...[...depth.values()]);
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "https";
  const origin = process.env.NEXT_PUBLIC_APP_URL || (host ? `${proto}://${host}` : "");
  const referralLink = `${origin}/r/${user.username}`;

  return (
    <div className="space-y-6">
      <PartnerProgress
        directPartners={directPartners}
        totalPartners={totalPartners}
        activePartners={activePartners}
        depth={maxDepth}
      />
      <ReferralCard
        link={referralLink}
        directs={directPartners}
        joinedThisMonth={joinedThisMonth}
      />
      {root ? <GenealogyTree root={root} /> : null}
      {root && root.children.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-[#D9D5CE] bg-white px-5 py-6 text-center text-sm text-[#5C5854]">
          Aún no tienes partners. Comparte tu enlace para empezar a construir tu equipo.
        </p>
      ) : null}
    </div>
  );
}
