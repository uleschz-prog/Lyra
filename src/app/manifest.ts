import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LYRA",
    short_name: "LYRA",
    description: "Tu oficina con agentes de IA y Vega, tu super agente.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F6F4F1",
    theme_color: "#FFFFFF",
    lang: "es",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Vega", short_name: "Vega", url: "/dashboard/super-agent", icons: [{ src: "/pwa-icon/192", sizes: "192x192" }] },
      { name: "Telegram", url: "/dashboard/telegram" },
    ],
  };
}
