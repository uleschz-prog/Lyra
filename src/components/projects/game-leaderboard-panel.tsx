"use client";

import { Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { resetRankingAction } from "@/app/dashboard/proyectos/ranking-actions";

type Row = { name: string; score: number };

/** Ranking en línea de un juego: top 10 y botón para borrarlo (p. ej. si alguien puso un nombre feo). */
export function GameLeaderboardPanel({ projectId, enabled, active, top, gameUrl }: { projectId: string; enabled: boolean; active: boolean; top: Row[]; gameUrl: string | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    startTransition(async () => {
      const result = await resetRankingAction(projectId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.removed ? `Ranking borrado (${result.removed} puntajes).` : "El ranking ya estaba vacío.");
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <aside aria-label="Ranking en línea" className="rounded-2xl border border-[#E7E2DA] bg-white p-4 dark:border-white/12 dark:bg-[#181625]">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[#1E1E24] dark:text-[#F2F0F7]">
        <Trophy className="size-4 text-[#7C3AED]" aria-hidden />
        Ranking en línea
      </h2>
      {!enabled ? (
        <p className="mt-1 text-xs text-[#8A8680]">Este juego no trae ranking en línea. Si lo quieres, pídele a Vega un juego nuevo con ranking en línea.</p>
      ) : !active ? (
        <p className="mt-1 text-xs text-[#8A8680]">Se activa al publicar el juego en su dirección de LYRA (/s/…). En la vista previa y fuera de LYRA solo se guarda el récord personal.</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-[#8A8680]">
            Top 10 con nombre en {gameUrl ? <a href={gameUrl} target="_blank" rel="noopener noreferrer" className="text-[#7C3AED] underline">tu juego publicado</a> : "tu juego publicado"}. Tiene límites por persona y cotas de puntaje, pero no es a prueba de trampas.
          </p>
          {top.length ? (
            <ol className="mt-3 space-y-1 text-sm">
              {top.map((row, index) => (
                <li key={`${row.name}-${index}`} className="flex justify-between gap-2 rounded-lg px-2 py-1 odd:bg-[#F6F4F1] dark:odd:bg-white/5">
                  <span className="truncate text-[#1E1E24] dark:text-[#F2F0F7]">
                    {index + 1}. {row.name}
                  </span>
                  <span className="font-semibold tabular-nums text-[#5B21B6] dark:text-[#C4B5FD]">{row.score.toLocaleString("es-MX")}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-[#5C5854] dark:text-[#C8C4D4]">Aún no hay puntajes.</p>
          )}
          {top.length ? (
            confirming ? (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[#5C5854] dark:text-[#C8C4D4]">Se borran todos los puntajes.</span>
                <button type="button" disabled={pending} onClick={reset} className="rounded-md bg-[#B91C1C] px-2 py-1 font-medium text-white disabled:opacity-50">
                  {pending ? "Borrando…" : "Borrar"}
                </button>
                <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="rounded-md px-2 py-1 text-[#5C5854] hover:bg-[#F3F0EB] dark:text-[#C8C4D4]">
                  Cancelar
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="mt-3 text-xs font-medium text-[#6D28D9] hover:underline dark:text-[#C4B5FD]">
                Borrar ranking
              </button>
            )
          ) : null}
        </>
      )}
    </aside>
  );
}
