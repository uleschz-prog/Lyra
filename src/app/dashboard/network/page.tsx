import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { GenealogyTree } from "@/components/network/genealogy-tree";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { loadNetwork, networkTree } from "@/lib/compensation/members";

export const metadata: Metadata = {
  title: "Mi Red",
};

export default async function NetworkPage() {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);

  const { users, depth } = await loadNetwork(user.id);
  const root = networkTree(user.id, users, depth);

  return (
    <>
      <PageHeader
        eyebrow="Genealogía"
        title="Mi red"
        description="Tu comunidad. Abre un nodo para ver patrocinador y rango."
        section="genealogy"
      />
      {root ? <GenealogyTree root={root} /> : null}
      {root && root.children.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-[#D9D5CE] bg-white px-5 py-6 text-center text-sm text-[#5C5854]">
          Aún no tienes invitados. Comparte tu enlace desde Inicio y aquí verás crecer tu constelación.
        </p>
      ) : null}
    </>
  );
}
