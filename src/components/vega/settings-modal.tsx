"use client";

import { Brain, CalendarClock, ChevronLeft, FolderOpen, History, Plug, ShieldCheck, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { AutonomyPanel } from "@/components/vega/autonomy-panel";
import { ConnectionsPanel } from "@/components/vega/connections-panel";
import { FilesPanel } from "@/components/vega/files-panel";
import { HistoryPanel } from "@/components/vega/history-panel";
import { MemoryPanel } from "@/components/vega/memory-panel";
import { RoutinesPanel } from "@/components/vega/tasks-panel";
import { cn } from "@/lib/utils";

type SettingsSection = "conexiones" | "autonomia" | "historial" | "rutinas" | "archivos" | "memoria";

const sections: { id: SettingsSection; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "conexiones", label: "Conexiones", hint: "Ver o desconectar tus apps", icon: Plug },
  { id: "autonomia", label: "Autonomía", hint: "Lo que se ejecuta sin confirmar", icon: ShieldCheck },
  { id: "historial", label: "Historial de acciones", hint: "Confirmadas, canceladas o vencidas", icon: History },
  { id: "rutinas", label: "Rutinas", hint: "Recordatorios y tareas programadas", icon: CalendarClock },
  { id: "archivos", label: "Archivos", hint: "Notas y documentos de Vega", icon: FolderOpen },
  { id: "memoria", label: "Memoria", hint: "Lo que Vega recuerda de ti", icon: Brain },
];

/** Ajustes compactos de Vega: conexiones, autonomía, historial y paneles que antes vivían en la columna derecha. */
export function SettingsModal({
  agentId,
  agentName,
  initialSection = null,
  onClose,
}: {
  agentId?: string;
  agentName?: string;
  initialSection?: SettingsSection | null;
  onClose: () => void;
}) {
  const [section, setSection] = useState<SettingsSection | null>(initialSection);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (section) setSection(null);
        else onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [section, onClose]);

  const current = sections.find((item) => item.id === section);
  const title = current?.label ?? "Ajustes";

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="presentation">
      <button type="button" className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" aria-label="Cerrar ajustes" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vega-settings-title"
        className="relative z-10 flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-[#F4F3F0] shadow-2xl sm:max-h-[min(36rem,85dvh)] sm:rounded-[28px] dark:bg-[#16141F]"
      >
        <span className="mx-auto mt-2 block h-1 w-10 rounded-full bg-[#E7E2DA] sm:hidden dark:bg-white/15" aria-hidden />
        <div className="flex items-center gap-1 px-3 pt-2 pb-1">
          {section ? (
            <button
              type="button"
              onClick={() => setSection(null)}
              className="grid size-9 place-items-center rounded-full text-[#5C5854] hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none dark:text-[#C7C2D3] dark:hover:bg-white/10"
              aria-label="Volver a ajustes"
            >
              <ChevronLeft className="size-5" />
            </button>
          ) : (
            <span className="size-9" aria-hidden />
          )}
          <h2 id="vega-settings-title" className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-[#1E1E24] dark:text-white">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full text-[#5C5854] hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none dark:text-[#C7C2D3] dark:hover:bg-white/10"
            aria-label="Cerrar ajustes"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {!section ? (
            <ul className="overflow-hidden rounded-2xl bg-white dark:bg-[#1B1924]">
              {sections.map(({ id, label, hint, icon: Icon }, index) => (
                <li key={id} className={cn(index > 0 && "border-t border-[#F3EFEA] dark:border-white/6")}>
                  <button
                    type="button"
                    onClick={() => setSection(id)}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-[#FBFAF8] focus-visible:bg-[#F5F3FF] focus-visible:outline-none dark:hover:bg-white/4"
                  >
                    <span className="grid size-8 place-items-center rounded-xl bg-[#F5F3FF] text-[#7C3AED] dark:bg-[#7C3AED]/15 dark:text-[#C4B5FD]">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-[#1E1E24] dark:text-white">{label}</span>
                      <span className="block truncate text-[11px] text-[#8A8680]">{hint}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : section === "conexiones" ? (
            <ConnectionsPanel variant="pane" />
          ) : section === "autonomia" ? (
            <AutonomyPanel variant="pane" />
          ) : section === "historial" ? (
            <HistoryPanel variant="pane" />
          ) : section === "rutinas" ? (
            <RoutinesPanel variant="pane" agentId={agentId} />
          ) : section === "archivos" ? (
            <FilesPanel variant="pane" />
          ) : (
            <MemoryPanel variant="pane" agentId={agentId} agentName={agentName} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
