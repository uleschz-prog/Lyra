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
          LYRA es un workspace de inteligencia artificial. La cuenta se abre con Inicio (29 dólares y 150
          créditos), Negocio (99 dólares y 300 créditos) o Pro (249 dólares y 1,000 créditos). Todos los
          paquetes incluyen los mismos servicios. Un crédito equivale a 1 dólar. A partir del mes siguiente,
          Inicio recarga desde 19, Negocio desde 49 y Pro desde 99. El único bono es Órbita: 20% en el nivel 1,
          10% en el nivel 2 y 5% del nivel 3 al 6, sobre paquetes y recargas de créditos.
        </p>
        <p>
          Cada dólar que entra a LYRA se convierte en 0.80 puntos. Las comisiones de la red, Órbita y el bono mundial,
          se calculan sobre esos puntos. Una cuenta pagada con un código promocional no genera comisión de
          inscripción. Las recompras de esa cuenta sí generan comisión.
        </p>
        <p>
          El contenido generado con los agentes y el estudio es responsabilidad de quien lo publica. Las comisiones
          quedan registradas en la billetera.
        </p>
      </div>
      <Link href={brand.links.home} className="mt-10 inline-block text-sm text-cyan-200">
        Volver al inicio
      </Link>
    </main>
  );
}
