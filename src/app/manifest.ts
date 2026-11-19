import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LYRA",
    short_name: "LYRA",
    description: "Super agente Vega y red de partners operada con agentes autónomos de IA.",
    id: "/",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "es-MX",
    dir: "ltr",
    background_color: "#0B0A10",
    theme_color: "#7C3AED",
    categories: ["business", "productivity", "education"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Vega", url: "/dashboard/super-agent", description: "Hablar con el superagente Vega" },
      { name: "Billetera", url: "/dashboard/wallet", description: "Tus créditos y transacciones" },
      { name: "Partners", url: "/dashboard/network", description: "Tu equipo y su crecimiento" },
    ],
  };
}
