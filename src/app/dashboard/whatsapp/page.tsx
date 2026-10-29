import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { whatsappChats, whatsappDashboard, whatsappSchedules } from "@/app/dashboard/super-agent/actions";
import { WhatsappManager } from "@/components/whatsapp/whatsapp-manager";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { canUseVega } from "@/lib/vega/access";

export const metadata: Metadata = { title: "WhatsApp Business" };

export default async function WhatsappPage() {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);
  if (!canUseVega(user)) redirect("/dashboard/super-agent");

  const [dashboard, chats, schedules] = await Promise.all([
    whatsappDashboard(),
    whatsappChats(),
    whatsappSchedules(),
  ]);
  if (!dashboard) redirect("/dashboard/super-agent");
  return <WhatsappManager initialDashboard={dashboard} initialChats={chats} initialSchedules={schedules} now={new Date().toISOString()} />;
}
