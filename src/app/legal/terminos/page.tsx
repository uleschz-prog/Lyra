import type { Metadata } from "next";
import Link from "next/link";

import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "Términos",
};

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-background px-4 py-16 text-zinc-300 sm:px-6">
      <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Legal</p>
      <h1 className="mt-4 text-3xl text-white">Términos de uso</h1>
      <div className="mt-6 space-y-4 text-sm leading-7">
        <p>
          LYRA es un workspace de inteligencia artificial. La cuenta se abre con Inicio (29 dólares y 300
          créditos), Negocio (99 dólares y 1,500 créditos) o Pro (299 dólares y 5,000 créditos). Para empresas,
          Corporate se cotiza según alcance. Un crédito equivale a 1 dólar. A partir del mes siguiente,
          Inicio recarga desde 19, Negocio desde 49 y Pro desde 99. Quien tiene 3 directos
          activos queda exento de recarga mientras se mantengan activos. La cuenta administradora es Corporate.
        </p>
        <p>
          El contenido generado con los agentes y el estudio es responsabilidad de quien lo publica. Las comisiones
          se calculan sobre membresías activadas y quedan registradas en la billetera.
        </p>
      </div>
      <Link href={brand.links.home} className="mt-10 inline-block text-sm text-cyan-200">
        Volver al inicio
      </Link>
    </main>
  );
}
