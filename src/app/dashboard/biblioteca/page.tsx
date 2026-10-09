import type { Metadata } from "next";

import { StudioLibrary } from "@/components/library/studio-library";
import { listCreations } from "@/lib/media-pieces";

export const metadata: Metadata = {
  title: "Biblioteca",
};

export default async function LibraryPage() {
  const pieces = await listCreations("studio", 80).catch(() => []);
  return <StudioLibrary initialPieces={pieces} />;
}
