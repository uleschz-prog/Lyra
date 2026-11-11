import type { Metadata } from "next";

import { LyraPresentation } from "@/components/landing/lyra-presentation";

export const metadata: Metadata = {
  title: "Presentación LYRA",
  description: "Una presentación interactiva del ecosistema LYRA y sus oportunidades de negocio.",
};

export default function PresentationPage() {
  return <LyraPresentation />;
}
