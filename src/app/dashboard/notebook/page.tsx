import type { Metadata } from "next";

import { NotebookWorkspace } from "@/components/notebook/notebook-workspace";
import { PageHeader } from "@/components/dashboard/page-header";
import { listCreations } from "@/lib/creations";

export const metadata: Metadata = {
  title: "Lyra Notebook",
};

export default async function NotebookPage() {
  const pieces = await listCreations("notebook").catch(() => []);
  return (
    <>
      <PageHeader
        eyebrow="Lyra Notebook"
        title="Investigación"
        description="Carga fuentes, pregunta sobre ellas y convierte el material en resumen, cuestionario, audio, diapositivas o video."
        section="notebook"
      />
      <NotebookWorkspace initialPieces={pieces} />
    </>
  );
}
