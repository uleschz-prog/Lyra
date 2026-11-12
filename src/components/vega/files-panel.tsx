"use client";

import { ChevronLeft, FileText, FolderOpen, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { deleteVegaFile, readVegaFile, vegaFiles } from "@/app/dashboard/super-agent/actions";
import { sheetClass } from "@/components/vega/sheet";
import type { VegaFileView } from "@/lib/vega/files";

function size(bytes: number) {
  return bytes < 1000 ? `${bytes} B` : `${(bytes / 1000).toFixed(1)} KB`;
}

export function FilesPanel({ onClose }: { onClose: () => void }) {
  const [files, setFiles] = useState<VegaFileView[] | null>(null);
  const [open, setOpen] = useState<{ path: string; content: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void vegaFiles().then((items) => {
      if (alive) setFiles(items);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function view(path: string) {
    const result = await readVegaFile(path);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setOpen({ path: result.path, content: result.contenido });
  }

  async function remove(path: string) {
    if (!window.confirm(`¿Borrar «${path}»? No se puede recuperar.`)) return;
    const result = await deleteVegaFile(path);
    if (!result.ok) {
      toast.error("No se pudo borrar. Intenta de nuevo.");
      return;
    }
    setFiles((current) => current?.filter((file) => file.path !== path) ?? null);
    if (open?.path === path) setOpen(null);
  }

  const used = files?.reduce((sum, file) => sum + file.bytes, 0) ?? 0;

  return (
    <div className={sheetClass}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-[#1E1E24]">
          {open ? (
            <button type="button" onClick={() => setOpen(null)} className="rounded p-0.5 text-[#8A8680]" aria-label="Volver">
              <ChevronLeft className="size-4" />
            </button>
          ) : (
            <FolderOpen className="size-4 text-[#7C3AED]" />
          )}
          {open ? open.path : "Archivos de Vega"}
        </p>
        <button type="button" onClick={onClose} className="rounded p-1 text-[#8A8680]" aria-label="Cerrar">
          <X className="size-4" />
        </button>
      </div>

      {open ? (
        <pre className="mt-3 min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-xl bg-[#FCFBF9] p-3 text-xs leading-5 text-[#1E1E24]">
          {open.content}
        </pre>
      ) : (
        <>
          <p className="mt-1 text-xs leading-5 text-[#8A8680]">
            Notas, borradores y resultados que Vega guarda para ti. Se conservan entre conversaciones y solo tú los ves.
            {files?.length ? ` Usas ${size(used)} de 2 MB.` : ""}
          </p>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
            {files === null ? (
              <p className="text-sm text-[#8A8680]">Cargando…</p>
            ) : files.length === 0 ? (
              <p className="rounded-xl bg-[#FCFBF9] p-3 text-sm text-[#8A8680]">
                Todavía no hay archivos. Pídele a Vega, por ejemplo: «Guarda esta lista de prospectos en un archivo».
              </p>
            ) : (
              <ul className="space-y-1.5">
                {files.map((file) => (
                  <li key={file.path} className="flex items-center gap-2 rounded-xl border border-[#F0ECE6] px-3 py-2">
                    <button type="button" onClick={() => void view(file.path)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <FileText className="size-4 shrink-0 text-[#8A8680]" />
                      <span className="min-w-0 flex-1 truncate text-sm text-[#1E1E24]">{file.path}</span>
                      <span className="shrink-0 text-xs text-[#A8A29E]">{size(file.bytes)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(file.path)}
                      className="shrink-0 rounded p-1 text-[#A8A29E] hover:text-[#B42318]"
                      aria-label="Borrar archivo"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
