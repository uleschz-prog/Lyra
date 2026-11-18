"use client";

import { History } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { restoreVersionAction } from "@/app/dashboard/proyectos/version-actions";

/** «Restaurar esta versión»: crea una versión nueva igual a la elegida; no borra ninguna. */
export function RestoreVersionButton({ projectId, number }: { projectId: string; number: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [requestKey] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();

  function restore() {
    startTransition(async () => {
      const result = await restoreVersionAction(projectId, number, requestKey);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Listo: la versión ${number} ahora es la versión ${result.versionNumber}.`);
      router.push(`/dashboard/proyectos/${projectId}?v=${result.versionNumber}`);
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-[#6D28D9] hover:bg-[#EDE9FE] dark:text-[#C4B5FD] dark:hover:bg-white/10">
        <History className="size-3.5" />
        Restaurar esta versión
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-[#5C5854] dark:text-[#C8C4D4]">Se guardará como versión nueva.</span>
      <button type="button" disabled={pending} onClick={restore} className="rounded-md bg-[#7C3AED] px-2 py-1 font-medium text-white disabled:opacity-50">
        {pending ? "Restaurando…" : "Restaurar"}
      </button>
      <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="rounded-md px-2 py-1 text-[#5C5854] hover:bg-[#F3F0EB] dark:text-[#C8C4D4]">
        Cancelar
      </button>
    </span>
  );
}
