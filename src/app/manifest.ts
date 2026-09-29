import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LYRA — Inteligencia Aumentada & Red Global",
    short_name: "LYRA",
    description: "Academia digital con red de referidos operada por agentes autónomos de IA.",
    id: "/",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#2E1065",
    theme_color: "#2E1065",
    categories: ["business", "productivity", "education"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Vega", url: "/dashboard/super-agent", description: "Hablar con el superagente Vega" },
      { name: "Billetera", url: "/dashboard/wallet", description: "Tus créditos y transacciones" },
      { name: "Red", url: "/dashboard/network", description: "Tu red de referidos" },
    ],
  };
}
