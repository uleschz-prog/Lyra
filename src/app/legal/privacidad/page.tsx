import type { Metadata } from "next";
import Link from "next/link";

import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "Privacidad",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-background px-4 py-16 text-zinc-300 sm:px-6">
      <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Legal</p>
      <h1 className="mt-4 text-3xl text-white">Privacidad</h1>
      <div className="mt-6 space-y-4 text-sm leading-7">
        <p>
          La cuenta guarda nombre, correo, usuario y la relación de patrocinio necesaria para el workspace y el
          programa de partners. La contraseña se almacena cifrada.
        </p>
        <p>
          Los documentos que subes al notebook se usan para responder tus consultas. No se venden a terceros.
        </p>
      </div>
      <Link href={brand.links.home} className="mt-10 inline-block text-sm text-cyan-200">
        Volver al inicio
      </Link>
    </main>
  );
}