import { redirect } from "next/navigation";

export default function LegacyPlanPage(): never {
  redirect("/dashboard/network");
}
