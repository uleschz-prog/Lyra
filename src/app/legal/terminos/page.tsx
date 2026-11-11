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
          créditos), Negocio (99 dólares y 300 créditos) o Pro (249 dólares y 1,000 créditos). Los planes incluyen
          respectivamente 40, 140 y 360 segundos de video por ciclo de 30 días; el cupo de video es independiente de
          los créditos y Wan 3.0 Prime consume 1.36 veces el cupo según la duración. Todos los paquetes incluyen los
          mismos servicios. Un crédito cuesta 1 dólar estadounidense y puede recargarse en cualquier plan desde
          5 créditos. Cada compra individual de exactamente 50 créditos recibe 10 créditos adicionales, para un
          total de 60. Una recarga de al menos 5 créditos durante el mes cuenta como actividad y habilita las
          comisiones y bonos mensuales correspondientes al plan. El bono Órbita paga 20% en el nivel 1, 10% en el
          nivel 2 y 5% del nivel 3 al 6, sobre paquetes y recargas de créditos.
        </p>
        <p>
          Cada dólar que entra a LYRA se convierte en 0.80 puntos. Las comisiones de la red, Órbita y el bono mundial,
          se calculan sobre esos puntos. Una cuenta pagada con un código promocional no genera comisión de
          inscripción. Las recargas de créditos de esa cuenta sí generan comisión.
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
