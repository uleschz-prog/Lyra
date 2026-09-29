import {
  Bell,
  Compass,
  Headphones,
  Megaphone,
  PenLine,
  Radar,
  Star,
  Target,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

export const agentIcons: Record<string, LucideIcon> = {
  recepcion: Star,
  prospector: Target,
  copywriter: PenLine,
  closer: Zap,
  mentor: Compass,
  comunidad: Users,
  embajador: Megaphone,
  soporte: Headphones,
  recordatorio: Bell,
  senales: Radar,
};
