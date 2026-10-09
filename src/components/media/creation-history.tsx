"use client";

import Link from "next/link";

import type { CreationRecord } from "@/lib/media-pieces";

const kindLabel = {
  audio: "Audio",
  video: "Video",
  pdf: "PDF",
  image: "Imagen",
  mindmap: "Mapa mental",
  report: "Informe",
  cards: "Tarjetas",
  quiz: "Cuestionario",
  infographic: "Infografía",
  table: "Tabla",
} as const;

export function CreationHistory({
  pieces,
  onOpen,
  onDelete,
  libraryHref,
}: {
  pieces: CreationRecord[];
  onOpen: (piece: CreationRecord) => void;
  onDelete: (piece: CreationRecord) => void;
  libraryHref?: string;
}) {
  return (
    <section className="rounded-2xl border border-[#E7E2DA] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] uppercase tracking-[0.22em] text-[#8A8680]">Historial</h2>
        {libraryHref ? (
          <Link href={libraryHref} className="text-xs font-medium text-[#7C3AED] hover:text-[#5B21B6]">
            Ver biblioteca
          </Link>
        ) : null}
      </div>
      {pieces.length === 0 ? (
        <p className="mt-3 text-sm text-[#5C5854]">Guarda una pieza y aparecerá aquí.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {pieces.map((piece) => (
            <li key={piece.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#F4F1EC] px-3 py-2">
              <button type="button" onClick={() => onOpen(piece)} className="min-w-0 text-left">
                <p className="truncate text-sm text-[#1E1E24]">{piece.title}</p>
                <p className="text-xs text-[#8A8680]">
                  {kindLabel[piece.kind]} · {new Date(piece.createdAt).toLocaleDateString("es-MX")}
                </p>
              </button>
              <button type="button" onClick={() => onDelete(piece)} className="text-xs text-[#9A3B2F]">
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
