"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { moderateTemplateAction, unpublishTemplateAction } from "@/app/dashboard/marketplace/actions";

export function ModerationButtons({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function decide(decision: "approve" | "reject") {
    const reason = decision === "reject" ? window.prompt("Motivo del rechazo (lo verá el autor)") ?? "" : undefined;
    if (decision === "reject" && reason === "") return;
    setBusy(true);
    const result = await moderateTemplateAction(id, decision, reason).finally(() => setBusy(false));
    if (!result.ok) toast.error(result.error);
    else toast.success(decision === "approve" ? "Plantilla aprobada" : "Plantilla rechazada");
    router.refresh();
  }
  return (
    <div className="flex gap-2">
      <button type="button" disabled={busy} onClick={() => void decide("approve")} className="rounded-lg bg-[#047857] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
        Aprobar
      </button>
      <button type="button" disabled={busy} onClick={() => void decide("reject")} className="rounded-lg border border-[#E7E2DA] px-3 py-1.5 text-xs font-medium text-[#B91C1C] disabled:opacity-60 dark:border-white/12">
        Rechazar
      </button>
    </div>
  );
}

export function UnpublishButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!window.confirm("¿Retirar esta plantilla del Marketplace? Quien ya la usó conserva su copia.")) return;
    setBusy(true);
    const result = await unpublishTemplateAction(id).finally(() => setBusy(false));
    if (!result.ok) toast.error(result.error);
    else toast.success("Plantilla retirada");
    router.refresh();
  }
  return (
    <button type="button" disabled={busy} onClick={() => void run()} className="rounded-lg border border-[#E7E2DA] px-3 py-1.5 text-xs font-medium text-[#5C5854] disabled:opacity-60 dark:border-white/12 dark:text-[#C8C4D4]">
      Retirar
    </button>
  );
}
