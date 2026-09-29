import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { CreativeStudio } from "@/components/studio/creative-studio";
import { listCreations } from "@/lib/creations";

export const metadata: Metadata = {
  title: "Estudio Creativo",
};

export default async function StudioPage() {
  const pieces = await listCreations("studio").catch(() => []);
  return (
    <>
      <PageHeader
        eyebrow="Estudio Creativo"
        title="Multimodal"
        description="Crea un video o una imagen. Eliges el formato y el detalle que tiene que verse."
        section="creative"
      />
      <CreativeStudio initialPieces={pieces} />
    </>
  );
}
