"use client";

import { History, X } from "lucide-react";
import { useEffect, useState } from "react";

import { vegaActionLog } from "@/app/dashboard/super-agent/actions";
import { sheetClass } from "@/components/vega/sheet";
import type { ActionLogEntry } from "@/lib/vega/action-store";

const statusLabels: Record<string, { label: string; className: string }> = {
  pending: { label: "Esperando tu confirmación", className: "bg-[#F5F3FF] text-[#5B21B6]" },
  running: { label: "En curso", className: "bg-[#F5F3FF] text-[#5B21B6]" },
  done: { label: "Hecho", className: "bg-[#ECFDF3] text-[#067647]" },
  failed: { label: "Falló", className: "bg-[#FEF3F2] text-[#B42318]" },
  cancelled: { label: "Cancelado", className: "bg-[#F2F4F7] text-[#475467]" },
  expired: { label: "Venció", className: "bg-[#FFFAEB] text-[#B54708]" },
};

const byLabels: Record<string, string> = { user: "lo confirmaste tú", autonomy: "por tu autonomía", system: "automático" };

function when(value: string) {
  return new Date(value).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  });
}

export function HistoryPanel({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<ActionLogEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    void vegaActionLog()
      .then((value) => {
        if (alive) setEntries(value);
      })
      .catch(() => {
        if (alive) setEntries([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className={sheetClass}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-[#1E1E24]">
          <History className="size-4 text-[#7C3AED]" />
          Historial de acciones
        </p>
        <button type="button" onClick={onClose} className="rounded p-1 text-[#8A8680]" aria-label="Cerrar">
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-1 text-xs leading-5 text-[#8A8680]">
        Todo lo que Vega preparó en tus apps: lo que confirmaste, cancelaste, venció o ejecutó tu autonomía. Hora de Ciudad de México.
      </p>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {entries === null ? (
          <p className="text-sm text-[#8A8680]">Cargando…</p>
        ) : entries.length === 0 ? (
          <p className="rounded-xl bg-[#FCFBF9] p-3 text-sm text-[#8A8680]">Todavía no hay acciones.</p>
        ) : (
          <ul className="space-y-1.5">
            {entries.map((entry) => {
              const status = statusLabels[entry.status] ?? statusLabels.pending;
              return (
                <li key={entry.id} className="rounded-xl border border-[#F0ECE6] px-3 py-2">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-sm break-words text-[#1E1E24]">{entry.description}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.className}`}>{status.label}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-[#A8A29E]">
                    {when(entry.decidedAt ?? entry.createdAt)}
                    {entry.executedBy && byLabels[entry.executedBy] ? ` · ${byLabels[entry.executedBy]}` : ""}
                    {entry.riskClass === "send" ? " · envío" : ""}
                  </p>
                  {entry.result && entry.status !== "cancelled" ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-[#5C5854]">{entry.result.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
