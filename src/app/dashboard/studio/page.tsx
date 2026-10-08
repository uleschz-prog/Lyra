import type { Metadata } from "next";

import { CreativeStudio } from "@/components/studio/creative-studio";
import { listCreations } from "@/lib/media-pieces";

export const metadata: Metadata = {
  title: "Estudio Creativo",
};

export default async function StudioPage() {
  const pieces = await listCreations("studio").catch(() => []);
  return (
    <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-8 lg:-mx-10 lg:-mt-10">
      <CreativeStudio initialPieces={pieces} />
    </div>
  );
}
