import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";

import { brand } from "@/config/brand";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: brand.name,
    template: `%s · ${brand.name}`,
  },
  description: brand.slogan,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-lyra-dark font-sans text-zinc-100">
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          closeButton
          toastOptions={{
            style: {
              background: "#13131F",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              color: "#f4f4f5",
            },
          }}
        />
      </body>
    </html>
  );
}
