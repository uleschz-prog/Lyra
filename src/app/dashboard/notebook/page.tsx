import type { Metadata } from "next";

import { NotebookWorkspace } from "@/components/notebook/notebook-workspace";
import { listCreations } from "@/lib/media-pieces";

export const metadata: Metadata = {
  title: "Lyra Notebook",
};

export default async function NotebookPage() {
  const pieces = await listCreations("notebook").catch(() => []);
  return (
    <div className="-mx-4 -my-4 sm:-mx-6 sm:-my-8 lg:-mx-10 lg:-my-10">
      <NotebookWorkspace initialPieces={pieces} />
    </div>
  );
}
