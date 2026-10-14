"use client";

import { Brain, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { addVegaMemory, clearVegaMemories, deleteVegaMemory, vegaMemories } from "@/app/dashboard/super-agent/actions";
import { sheetClass } from "@/components/vega/sheet";
import type { VegaMemoryView } from "@/lib/vega/memory";

export function MemoryPanel({ onClose }: { onClose: () => void }) {
  const [memories, setMemories] = useState<VegaMemoryView[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void vegaMemories().then((items) => {
      if (alive) setMemories(items);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function add() {
    const content = draft.trim();
    if (content.length < 3 || busy) return;
    setBusy(true);
    const result = await addVegaMemory(content);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setDraft("");
    if (!result.duplicate) setMemories((current) => [result.memory, ...(current ?? [])]);
    toast.success(result.duplicate ? "Vega ya lo recordaba" : "Guardado en la memoria de Vega");
  }

  async function remove(id: string) {
    const result = await deleteVegaMemory(id);
    if (!result.ok) {
      toast.error("No se pudo borrar. Intenta de nuevo.");
      return;
    }
    setMemories((current) => current?.filter((memory) => memory.id !== id) ?? null);
  }

  async function clearAll() {
    if (!window.confirm("¿Borrar todo lo que Vega recuerda de ti? No se puede recuperar.")) return;
    const result = await clearVegaMemories();
    if (result.ok) {
      setMemories([]);
      toast.success("Memoria borrada");
    }
  }

  return (
    <div className={sheetClass}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-[#1E1E24]">
          <Brain className="size-4 text-[#7C3AED]" />
          Lo que Vega recuerda de ti
        </p>
        <button type="button" onClick={onClose} className="rounded p-1 text-[#8A8680]" aria-label="Cerrar">
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-1 text-xs leading-5 text-[#8A8680]">
        Vega usa estos datos en todas tus conversaciones. Solo tú los ves.
      </p>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={300}
          placeholder="Agrega un dato, p. ej. «Mi meta es 20 socios este año»"
          className="min-w-0 flex-1 rounded-lg border border-[#E7E2DA] px-3 py-2 text-base text-[#1E1E24] outline-none sm:text-sm focus:border-[#7C3AED]"
        />
        <button
          type="submit"
          disabled={busy || draft.trim().length < 3}
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#1E1E24] text-white disabled:opacity-40"
          aria-label="Agregar dato"
        >
          <Plus className="size-4" />
        </button>
      </form>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {memories === null ? (
          <p className="text-sm text-[#8A8680]">Cargando…</p>
        ) : memories.length === 0 ? (
          <p className="rounded-xl bg-[#FCFBF9] p-3 text-sm text-[#8A8680]">
            Todavía no hay datos. Cuéntale a Vega sobre tu negocio y tus metas, o agrégalos aquí.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {memories.map((memory) => (
              <li key={memory.id} className="group flex items-start gap-2 rounded-xl border border-[#F0ECE6] px-3 py-2">
                <p className="min-w-0 flex-1 text-sm text-[#1E1E24]">{memory.content}</p>
                <button
                  type="button"
                  onClick={() => void remove(memory.id)}
                  className="shrink-0 rounded p-1 text-[#A8A29E] hover:text-[#B42318]"
                  aria-label="Borrar dato"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {memories?.length ? (
        <button type="button" onClick={() => void clearAll()} className="mt-3 self-start text-xs font-medium text-[#B42318]">
          Borrar toda la memoria
        </button>
      ) : null}
    </div>
  );
}
