import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";

import { brand } from "@/config/brand";
import { Splash } from "@/components/app/splash";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const themeScript = `(function(){try{var t=localStorage.getItem('lyra-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}}catch(e){}})();`;

// Pantallas de arranque nativas iOS (apple-touch-startup-image) con media queries por dispositivo.
const startupImages: Array<{ href: string; media: string }> = [
  { href: "/splash/1290x2796.png", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" },
  { href: "/splash/2796x1290.png", media: "(device-width: 932px) and (device-height: 430px) and (-webkit-device-pixel-ratio: 3)" },
  { href: "/splash/1179x2556.png", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)" },
  { href: "/splash/2556x1179.png", media: "(device-width: 852px) and (device-height: 393px) and (-webkit-device-pixel-ratio: 3)" },
  { href: "/splash/1284x2778.png", media: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)" },
  { href: "/splash/2778x1284.png", media: "(device-width: 926px) and (device-height: 428px) and (-webkit-device-pixel-ratio: 3)" },
  { href: "/splash/1170x2532.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" },
  { href: "/splash/2532x1170.png", media: "(device-width: 844px) and (device-height: 390px) and (-webkit-device-pixel-ratio: 3)" },
  { href: "/splash/750x1334.png", media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)" },
  { href: "/splash/1334x750.png", media: "(device-width: 667px) and (device-height: 375px) and (-webkit-device-pixel-ratio: 2)" },
  { href: "/splash/640x1136.png", media: "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)" },
  { href: "/splash/1136x640.png", media: "(device-width: 568px) and (device-height: 320px) and (-webkit-device-pixel-ratio: 2)" },
];

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#2E1065",
};

export const metadata: Metadata = {
  title: {
    default: brand.name,
    template: `%s · ${brand.name}`,
  },
  description: brand.slogan,
  applicationName: brand.name,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: brand.name, statusBarStyle: "black-translucent" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background font-sans text-foreground">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <head>
          {startupImages.map((img) => (
            <link key={img.href} rel="apple-touch-startup-image" href={img.href} media={img.media} />
          ))}
        </head>
        <Splash />
        {children}
        <Toaster
          theme="system"
          position="bottom-right"
          closeButton
          toastOptions={{
            style: {
              background: "#FFFFFF",
              border: "1px solid #D9D5CE",
              color: "#1E1E24",
            },
          }}
        />
      </body>
    </html>
  );
}
