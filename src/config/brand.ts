import {
  Crown,
  FolderKanban,
  GraduationCap,
  Home,
  Library,
  Network,
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
    upgrade: "/dashboard/upgrade",
    academy: "/dashboard/academy",
    library: "/dashboard/biblioteca",
    wallet: "/dashboard/wallet",
    notifications: "/dashboard/notificaciones",
    presentation: "/presentacion",
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
        href: "/dashboard/super-agent",
        label: "Vega",
        description: "Tu super agente",
        icon: Crown,
      },
      {
        href: "/dashboard/proyectos",
        label: "Proyectos",
        description: "Sitios, apps y agentes que creas",
        icon: FolderKanban,
      },
      {
        href: "/dashboard/biblioteca",
        label: "Biblioteca",
        description: "Videos e imágenes del estudio",
        icon: Library,
      },
      {
        href: "/dashboard/network",
        label: "Partners",
        description: "Tu comunidad y su crecimiento",
        icon: Network,
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
] as const;
