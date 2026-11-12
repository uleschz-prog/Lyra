"use client";

import { Check, Pencil, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { deleteProject, renameProject } from "@/app/dashboard/proyectos/actions";

/** Renombrar y borrar un proyecto (borrado suave). */
export function ProjectActions({
  id,
  title,
  afterDelete,
  compact = false,
}: {
  id: string;
  title: string;
  /** Ruta a la que ir después de borrar (desde el detalle). */
  afterDelete?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await renameProject(id, value);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setEditing(false);
      toast.success("Nombre actualizado");
      router.refresh();
    });
  }

  function remove() {
    if (!window.confirm(`¿Borrar «${title}» de tus proyectos?`)) return;
    startTransition(async () => {
      const result = await deleteProject(id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Proyecto borrado");
      if (afterDelete) router.push(afterDelete);
      else router.refresh();
    });
  }

  if (editing) {
    return (
      <form onSubmit={submit} className="flex w-full items-center gap-2">
        <label className="sr-only" htmlFor={`nombre-${id}`}>
          Nuevo nombre
        </label>
        <input
          id={`nombre-${id}`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={80}
          autoFocus
          className="min-h-9 min-w-0 flex-1 rounded-lg border border-[#E7E2DA] bg-white px-3 text-sm text-[#1E1E24] outline-none focus:border-[#7C3AED] dark:border-white/12 dark:bg-[#181625] dark:text-[#F2F0F7]"
        />
        <button type="submit" disabled={pending} aria-label="Guardar nombre" className="grid size-9 place-items-center rounded-lg bg-[#7C3AED] text-white disabled:opacity-60">
          <Check className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setValue(title);
          }}
          aria-label="Cancelar"
          className="grid size-9 place-items-center rounded-lg border border-[#E7E2DA] text-[#5C5854] dark:border-white/12"
        >
          <X className="size-4" />
        </button>
      </form>
    );
  }

  const button =
    "inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1E1E24] hover:border-[#C4B5FD] disabled:opacity-60 dark:border-white/12 dark:bg-[#181625] dark:text-[#F2F0F7]";
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => setEditing(true)} disabled={pending} className={button} aria-label={`Renombrar ${title}`}>
        <Pencil className="size-3.5" />
        {compact ? null : "Renombrar"}
      </button>
      <button type="button" onClick={remove} disabled={pending} className={`${button} text-[#9A3B2F]`} aria-label={`Borrar ${title}`}>
        <Trash2 className="size-3.5" />
        {compact ? null : "Borrar"}
      </button>
    </div>
  );
}
