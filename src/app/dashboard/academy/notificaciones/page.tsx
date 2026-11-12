import { redirect } from "next/navigation";

import { brand } from "@/config/brand";

// Las notificaciones ahora son globales; esta ruta queda por enlaces viejos.
export default function OldNotificationsPage() {
  redirect(brand.links.notifications);
}
