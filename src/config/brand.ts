import {
  Bot,
  GraduationCap,
  LayoutDashboard,
  Network,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type BrandNavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export const brand = {
  name: "LYRA",
  slogan: "Inteligencia Aumentada & Red Global",
  description:
    "Backoffice para una academia digital y una red multinivel operada con agentes autónomos.",
  colors: {
    dark: "#0B0B12",
    card: "#13131F",
    border: "rgba(255, 255, 255, 0.08)",
    violet: "#7C3AED",
    cyan: "#06B6D4",
  },
  links: {
    home: "/",
    dashboard: "/dashboard",
    network: "/dashboard/network",
    academy: "/dashboard/academy",
    aiStudio: "/dashboard/ai-studio",
    wallet: "/dashboard/wallet",
  },
  navigation: [
    {
      href: "/dashboard",
      label: "Dashboard",
      description: "Pulso de la red y de los créditos",
      icon: LayoutDashboard,
    },
    {
      href: "/dashboard/network",
      label: "Mi Red",
      description: "Árbol genealógico",
      icon: Network,
    },
    {
      href: "/dashboard/academy",
      label: "Academia",
      description: "Cursos según tu rango",
      icon: GraduationCap,
    },
    {
      href: "/dashboard/ai-studio",
      label: "Estudio IA",
      description: "Agentes y créditos",
      icon: Bot,
    },
    {
      href: "/dashboard/wallet",
      label: "Billetera",
      description: "Comisiones y créditos",
      icon: Wallet,
    },
  ] satisfies BrandNavItem[],
};
