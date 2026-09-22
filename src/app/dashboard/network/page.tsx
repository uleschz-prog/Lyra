import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { GenealogyTree } from "@/components/network/genealogy-tree";
import { networkTree } from "@/lib/demo-data";

export const metadata: Metadata = {
  title: "Mi Red",
};

export default function NetworkPage() {
  return (
    <>
      <PageHeader
        eyebrow="Genealogía"
        title="Mi red"
        description="Línea frontal y profundidad. Abre un nodo para ver patrocinador, rango y volumen."
      />
      <GenealogyTree root={networkTree} />
    </>
  );
}
