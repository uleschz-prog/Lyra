import {
  BookOpen,
  Bot,
  Crown,
  GraduationCap,
  Home,
  Network,
  Orbit,
  Sparkles,
  Wallet,
} from "lucide-react";

export const brand = {
  name: "LYRA",
  slogan: "Inteligencia Aumentada & Red Global",
  description:
    "Backoffice para una academia digital y una red multinivel operada con agentes autónomos.",
  colors: {
    dark: "#08090A",
    card: "#0D0E11",
    border: "#1C1D22",
    violet: "#7C3AED",
    cyan: "#06B6D4",
  },
  links: {
    home: "/",
    login: "/login",
    register: "/register",
    dashboard: "/dashboard",
    network: "/dashboard/network",
    plan: "/dashboard/plan",
    academy: "/dashboard/academy",
    aiStudio: "/dashboard/ai-studio",
    notebook: "/dashboard/notebook",
    studio: "/dashboard/studio",
    wallet: "/dashboard/wallet",
  },
};

export const officeModes = [
  {
    id: "comunidad",
    label: "Comunidad",
    home: "/dashboard",
    items: [
      {
        href: "/dashboard",
        label: "Inicio",
        description: "La pregunta para crear",
        icon: Home,
      },
      {
        href: "/dashboard/notebook",
        label: "Notebook",
        description: "Investigación sobre tus fuentes",
        icon: BookOpen,
      },
      {
        href: "/dashboard/studio",
        label: "Estudio creativo",
        description: "Video con imagen y sonido",
        icon: Sparkles,
      },
      {
        href: "/dashboard/network",
        label: "Mi Red",
        description: "Árbol genealógico",
        icon: Network,
      },
      {
        href: "/dashboard/plan",
        label: "Partners",
        description: "Comisiones y membresías",
        icon: Orbit,
      },
      {
        href: "/dashboard/academy",
        label: "Academia",
        description: "Cursos según tu rango",
        icon: GraduationCap,
      },
      {
        href: "/dashboard/wallet",
        label: "Billetera",
        description: "Comisiones y créditos",
        icon: Wallet,
      },
    ],
  },
  {
    id: "agentes",
    label: "Agentes",
    home: "/dashboard/ai-studio",
    items: [
      {
        href: "/dashboard/ai-studio",
        label: "Agentes",
        description: "Constelación y canales",
        icon: Bot,
      },
      {
        href: "/dashboard/super-agent",
        label: "Super agente",
        description: "Lyra vende y cobra por ti",
        icon: Crown,
      },
    ],
  },
] as const;
