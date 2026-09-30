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

/**
 * Imagen alusiva por bot: gradiente + símbolo que representa su función.
 * Se usa como cabecera visual en la barra de agentes y en la consola.
 */
export type AgentArt = {
  /** Gradiente de fondo (Tailwind / CSS). */
  gradient: string;
  /** Color de acento del símbolo y del texto. */
  accent: string;
  /** Emoji/símbolo alusivo a la función del bot. */
  glyph: string;
};

export const agentArt: Record<string, AgentArt> = {
  recepcion: {
    gradient: "from-[#7C3AED] via-[#8B5CF6] to-[#06B6D4]",
    accent: "#7C3AED",
    glyph: "📅",
  },
  prospector: {
    gradient: "from-[#06B6D4] via-[#0EA5E9] to-[#6366F1]",
    accent: "#0891B2",
    glyph: "🎯",
  },
  copywriter: {
    gradient: "from-[#F59E0B] via-[#FB7185] to-[#7C3AED]",
    accent: "#D97706",
    glyph: "✍️",
  },
  closer: {
    gradient: "from-[#10B981] via-[#059669] to-[#06B6D4]",
    accent: "#059669",
    glyph: "🤝",
  },
  mentor: {
    gradient: "from-[#6366F1] via-[#7C3AED] to-[#A78BFA]",
    accent: "#6366F1",
    glyph: "🎓",
  },
  comunidad: {
    gradient: "from-[#EC4899] via-[#F43F5E] to-[#F59E0B]",
    accent: "#DB2777",
    glyph: "👥",
  },
  embajador: {
    gradient: "from-[#0EA5E9] via-[#6366F1] to-[#8B5CF6]",
    accent: "#0284C7",
    glyph: "🚀",
  },
  soporte: {
    gradient: "from-[#14B8A6] via-[#06B6D4] to-[#3B82F6]",
    accent: "#0D9488",
    glyph: "🎧",
  },
  recordatorio: {
    gradient: "from-[#F59E0B] via-[#F97316] to-[#EF4444]",
    accent: "#EA580C",
    glyph: "⏰",
  },
  senales: {
    gradient: "from-[#8B5CF6] via-[#D946EF] to-[#EC4899]",
    accent: "#A21CAF",
    glyph: "📈",
  },
};

export function agentArtFor(id: string): AgentArt {
  return (
    agentArt[id] ?? {
      gradient: "from-[#7C3AED] via-[#8B5CF6] to-[#06B6D4]",
      accent: "#7C3AED",
      glyph: "✨",
    }
  );
}
