"use client";

import type { CreationRecord } from "@/lib/creations";

const kindLabel = { audio: "Audio", video: "Video", pdf: "PDF", image: "Imagen" } as const;

export function CreationHistory({
  pieces,
  onOpen,
  onDelete,
}: {
  pieces: CreationRecord[];
  onOpen: (piece: CreationRecord) => void;
  onDelete: (piece: CreationRecord) => void;
}) {
  return (
    <section className="rounded-2xl border border-[#E7E2DA] bg-white p-4">
      <h2 className="text-[11px] uppercase tracking-[0.22em] text-[#8A8680]">Historial</h2>
      {pieces.length === 0 ? (
        <p className="mt-3 text-sm text-[#5C5854]">Lo que crees queda guardado en tu cuenta.</p>
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
