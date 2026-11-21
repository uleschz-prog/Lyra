"use client";

import { Check, Copy, Database, Download, KeyRound, Pause, Play, Plus, UserMinus, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addMemberAction,
  enableLiveDataAction,
  resetPinAction,
  saveBranchesAction,
  setLiveStatusAction,
  setMemberActiveAction,
} from "@/app/dashboard/proyectos/live-actions";
import type { SpaceOverview } from "@/lib/liveapps/core";

const card = "rounded-2xl border border-[#E7E2DA] bg-white p-4 dark:border-white/12 dark:bg-[#181625]";
const input =
  "w-full min-w-0 rounded-lg border border-[#E7E2DA] bg-[#FAF9F7] px-2.5 py-1.5 text-sm text-[#1E1E24] outline-none focus:border-[#7C3AED] dark:border-white/12 dark:bg-[#0F0D16] dark:text-[#F2F0F7]";
const small =
  "inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-medium text-[#1E1E24] ring-1 ring-black/5 hover:bg-[#FAF9F7] disabled:opacity-50 dark:bg-white/10 dark:text-white";
const primary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#7C3AED] px-3 py-2 text-xs font-semibold text-white hover:bg-[#6D28D9] disabled:opacity-60";

function since(iso: string | null) {
  if (!iso) return "Nunca ha entrado";
  return `Entró ${new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" })}`;
}

/** Datos en vivo de una app: activar, equipo con PIN, sucursales, conteos y exportar. */
export function LiveDataPanel({
  projectId,
  hasManifest,
  overview,
  appUrl,
  monthlyFee,
}: {
  projectId: string;
  hasManifest: boolean;
  overview: SpaceOverview | null;
  /** Dirección pública de la app (null si no está publicada). */
  appUrl: string | null;
  monthlyFee: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [revealed, setRevealed] = useState<{ name: string; pin: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [branches, setBranches] = useState(overview?.branches ?? []);
  const [name, setName] = useState("");
  const roles = overview?.roles ?? [];
  const [role, setRole] = useState(roles.find((item) => item.key !== "admin")?.key ?? "admin");
  const [branchId, setBranchId] = useState(overview?.branches[0]?.id ?? "");
  // Al activar (o si cambian en el servidor) el panel toma las sucursales nuevas.
  const serverBranches = JSON.stringify(overview?.branches ?? []);
  const [seenBranches, setSeenBranches] = useState(serverBranches);
  if (seenBranches !== serverBranches) {
    const next = JSON.parse(serverBranches) as { id: string; name: string }[];
    setSeenBranches(serverBranches);
    setBranches(next);
    if (!next.some((item) => item.id === branchId)) setBranchId(next[0]?.id ?? "");
  }

  const roleLabel = new Map(roles.map((item) => [item.key, item.label]));
  const branchLabel = new Map((overview?.branches ?? []).map((item) => [item.id, item.name]));

  function act<T extends { ok: true }>(run: () => Promise<T | { ok: false; error: string }>, onOk: (result: T) => void) {
    startTransition(async () => {
      const result = await run();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onOk(result as T);
      router.refresh();
    });
  }

  async function copyPin() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.pin);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("No se pudo copiar; anótalo a mano.");
    }
  }

  const status = overview ? (overview.status === "active" ? "Activos" : "En pausa") : "Sin activar";

  return (
    <section aria-labelledby="live-title" className={card}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="live-title" className="flex items-center gap-1.5 text-sm font-semibold text-[#1E1E24] dark:text-[#F2F0F7]">
          <Database className="size-4 text-[#7C3AED]" aria-hidden />
          Datos en vivo
        </h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            overview?.status === "active" ? "bg-[#DCFCE7] text-[#166534] dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-[#F3F0EB] text-[#5C5854] dark:bg-white/10 dark:text-[#C8C4D4]"
          }`}
        >
          {status}
        </span>
      </div>

      {revealed ? (
        <div role="status" className="mt-3 rounded-xl bg-[#F5F3FF] p-3 dark:bg-[#7C3AED]/15">
          <p className="text-xs text-[#5B21B6] dark:text-[#DDD6FE]">PIN de {revealed.name}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-2xl font-semibold tracking-[0.3em] text-[#1E1E24] dark:text-white">{revealed.pin}</span>
            <button type="button" onClick={() => void copyPin()} className={small}>
              {copied ? <Check className="size-3.5 text-[#10B981]" /> : <Copy className="size-3.5" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-[#5C5854] dark:text-[#C8C4D4]">Dáselo en persona. Por seguridad no se vuelve a mostrar; si se pierde, genera uno nuevo.</p>
          <button type="button" onClick={() => setRevealed(null)} className="mt-2 text-[11px] font-medium text-[#7C3AED]">
            Ya lo anoté
          </button>
        </div>
      ) : null}

      {!overview ? (
        hasManifest ? (
          <div className="mt-2 space-y-3">
            <p className="text-xs leading-relaxed text-[#5C5854] dark:text-[#C8C4D4]">
              Tu equipo comparte la misma información al momento: cada persona entra con su PIN, con su rol y su sucursal. Los datos se guardan en LYRA y puedes exportarlos cuando quieras.
            </p>
            <button
              type="button"
              disabled={pending}
              className={primary}
              onClick={() =>
                act(
                  () => enableLiveDataAction(projectId),
                  (result) => {
                    if (result.adminPin) setRevealed({ name: "Administración", pin: result.adminPin });
                    toast.success("Datos en vivo activados.");
                  },
                )
              }
            >
              <Database className="size-3.5" />
              Activar datos en vivo
            </button>
            {monthlyFee > 0 ? <p className="text-[11px] text-[#8A8680]">Cuesta {monthlyFee} créditos al mes por app.</p> : null}
          </div>
        ) : (
          <p className="mt-2 text-xs leading-relaxed text-[#5C5854] dark:text-[#C8C4D4]">
            Esta versión guarda los datos en cada dispositivo. Para que tu equipo comparta la información, pídele a Vega la app «con datos en vivo» (roles, sucursales y PIN por persona).
          </p>
        )
      ) : (
        <div className="mt-3 space-y-4">
          <p className="text-xs text-[#5C5854] dark:text-[#C8C4D4]">
            {appUrl ? (
              <>
                Tu equipo entra en{" "}
                <a href={appUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-[#7C3AED] underline-offset-2 hover:underline">
                  {appUrl.replace(/^https?:\/\//, "")}
                </a>{" "}
                con su PIN.
              </>
            ) : (
              "Publica la app (arriba) para que tu equipo pueda entrar con su PIN."
            )}
          </p>

          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Registros", overview.recordCount],
              ["Cambios hoy", overview.today.writes],
              ["Entradas hoy", overview.today.logins],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-[#FAF9F7] px-2 py-2 dark:bg-white/[0.04]">
                <dt className="text-[10px] text-[#8A8680]">{label}</dt>
                <dd className="text-sm font-semibold text-[#1E1E24] tabular-nums dark:text-white">{Number(value).toLocaleString("es-MX")}</dd>
              </div>
            ))}
          </dl>

          <div>
            <h3 className="text-xs font-semibold text-[#1E1E24] dark:text-[#F2F0F7]">Información</h3>
            <ul className="mt-1.5 divide-y divide-[#F0ECE6] dark:divide-white/8">
              {overview.collections.map((collection) => (
                <li key={collection.key} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                  <span className="text-[#1E1E24] dark:text-[#F2F0F7]">
                    {collection.label}
                    <span className="ml-1.5 text-[#8A8680] tabular-nums">{collection.count.toLocaleString("es-MX")}</span>
                  </span>
                  <a href={`/api/proyectos/${projectId}/datos?c=${encodeURIComponent(collection.key)}`} className={small} title={`Descargar ${collection.label} en CSV`}>
                    <Download className="size-3" />
                    CSV
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-[#1E1E24] dark:text-[#F2F0F7]">Sucursales</h3>
            <div className="mt-1.5 space-y-1.5">
              {branches.map((branch, index) => (
                <input
                  key={branch.id || `nueva-${index}`}
                  value={branch.name}
                  aria-label={`Nombre de la sucursal ${index + 1}`}
                  onChange={(event) => setBranches((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, name: event.target.value } : item)))}
                  className={input}
                />
              ))}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              <button type="button" className={small} onClick={() => setBranches((current) => [...current, { id: "", name: "" }])}>
                <Plus className="size-3" />
                Agregar
              </button>
              <button
                type="button"
                disabled={pending}
                className={small}
                onClick={() =>
                  act(
                    () => saveBranchesAction(projectId, branches),
                    (result) => {
                      setBranches(result.branches);
                      toast.success("Sucursales guardadas.");
                    },
                  )
                }
              >
                Guardar sucursales
              </button>
            </div>
          </div>

          <div>
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-[#1E1E24] dark:text-[#F2F0F7]">
              <Users className="size-3.5" aria-hidden />
              Equipo
            </h3>
            <ul className="mt-1.5 space-y-1.5">
              {overview.members.map((member) => (
                <li key={member.id} className={`rounded-xl px-2.5 py-2 text-xs ${member.active ? "bg-[#FAF9F7] dark:bg-white/[0.04]" : "opacity-60"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium text-[#1E1E24] dark:text-[#F2F0F7]">{member.name}</span>
                    <span className="shrink-0 text-[#5C5854] dark:text-[#C8C4D4]">
                      {roleLabel.get(member.role) ?? member.role}
                      {member.branchId ? ` · ${branchLabel.get(member.branchId) ?? member.branchId}` : " · Todas"}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#8A8680]">{member.active ? since(member.lastSeenAt) : "Dado de baja"}</span>
                    <span className="flex gap-1">
                      <button
                        type="button"
                        disabled={pending}
                        className={small}
                        onClick={() => act(() => resetPinAction(projectId, member.id), (result) => setRevealed({ name: member.name, pin: result.pin }))}
                      >
                        <KeyRound className="size-3" />
                        Nuevo PIN
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        className={small}
                        aria-label={member.active ? `Dar de baja a ${member.name}` : `Reactivar a ${member.name}`}
                        onClick={() => act(() => setMemberActiveAction(projectId, member.id, !member.active), () => toast.success(member.active ? "Persona dada de baja." : "Persona reactivada."))}
                      >
                        {member.active ? <UserMinus className="size-3" /> : <UserPlus className="size-3" />}
                      </button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <form
              className="mt-2 grid gap-1.5 rounded-xl border border-dashed border-[#E7E2DA] p-2.5 dark:border-white/12"
              onSubmit={(event) => {
                event.preventDefault();
                const branch = role === "admin" ? null : branchId || null;
                act(
                  () => addMemberAction(projectId, { name, role, branchId: branch }),
                  (result) => {
                    setRevealed({ name: result.member.name, pin: result.pin });
                    setName("");
                  },
                );
              }}
            >
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre (p. ej. Lupita)" aria-label="Nombre de la persona" maxLength={40} className={input} />
              <div className="grid grid-cols-2 gap-1.5">
                <select value={role} onChange={(event) => setRole(event.target.value)} aria-label="Rol" className={input}>
                  {roles.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <select value={role === "admin" ? "" : branchId} disabled={role === "admin"} onChange={(event) => setBranchId(event.target.value)} aria-label="Sucursal" className={input}>
                  {role === "admin" ? <option value="">Todas</option> : null}
                  {overview.branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={pending || name.trim().length < 2} className={primary}>
                <UserPlus className="size-3.5" />
                Agregar y generar PIN
              </button>
            </form>
          </div>

          <button
            type="button"
            disabled={pending}
            className={small}
            onClick={() => {
              const pause = overview.status === "active";
              if (pause && !window.confirm("¿Pausar? Nadie podrá entrar hasta que la reactives. Los datos se conservan.")) return;
              act(() => setLiveStatusAction(projectId, !pause), () => toast.success(pause ? "App en pausa." : "App reactivada."));
            }}
          >
            {overview.status === "active" ? <Pause className="size-3" /> : <Play className="size-3" />}
            {overview.status === "active" ? "Pausar datos en vivo" : "Reactivar"}
          </button>
        </div>
      )}
    </section>
  );
}
