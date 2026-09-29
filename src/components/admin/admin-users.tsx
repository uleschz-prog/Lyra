"use client";

import { Copy, Download, KeyRound, Search, ShieldCheck, Trash2, UserCheck, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  adjustCredits,
  deleteAccount,
  resetPassword,
  suspendAccount,
  updateProfile,
  validateRegistration,
} from "@/app/dashboard/admin/actions";
import { formatCredits, formatUsd } from "@/lib/format";

export type AdminUserRow = {
  id: string;
  name: string;
  username: string;
  email: string;
  isAdmin: boolean;
  packageId: string | null;
  pendingPackage: string | null;
  credits: number;
  activationCredits: number;
  walletBalance: number;
  sponsorName: string | null;
  referrals: number;
  createdAt: string;
  suspendedUntil: string | null;
};

type Filter = "all" | "pending" | "suspended";

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "pending", label: "Pendientes de pago" },
  { id: "suspended", label: "Suspendidos" },
];

const planLabel = (id: string | null) => (id ? id.charAt(0) + id.slice(1).toLowerCase() : "Sin plan");

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

function Status({ user }: { user: AdminUserRow }) {
  if (user.suspendedUntil) {
    const indefinite = new Date(user.suspendedUntil).getUTCFullYear() >= 2100;
    return (
      <span className="rounded-full bg-[#FDECEC] px-2.5 py-1 text-xs font-medium text-[#B42318]">
        {indefinite ? "Suspendida" : `Suspendida hasta ${shortDate(user.suspendedUntil)}`}
      </span>
    );
  }
  if (user.pendingPackage) {
    return <span className="rounded-full bg-[#FFF4E0] px-2.5 py-1 text-xs font-medium text-[#B54708]">Pendiente de pago</span>;
  }
  return <span className="rounded-full bg-[#E8F7EE] px-2.5 py-1 text-xs font-medium text-[#067647]">Activa</span>;
}

export function AdminUsers({ users }: { users: AdminUserRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((user) => {
      if (filter === "pending" && !user.pendingPackage) return false;
      if (filter === "suspended" && !user.suspendedUntil) return false;
      if (!needle) return true;
      return [user.name, user.username, user.email].some((value) => value.toLowerCase().includes(needle));
    });
  }, [users, query, filter]);

  const pendingCount = users.filter((user) => user.pendingPackage).length;
  const suspendedCount = users.filter((user) => user.suspendedUntil).length;

  return (
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Cuentas", value: users.length },
          { label: "Pendientes de pago", value: pendingCount },
          { label: "Suspendidas", value: suspendedCount },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-[#E7E2DA] bg-white p-4">
            <p className="text-xs text-[#8A8680]">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold text-[#1E1E24]">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-[#E7E2DA] bg-white px-3 py-2">
          <Search className="size-4 text-[#8A8680]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Busca por nombre, usuario o correo"
            className="w-full bg-transparent text-sm text-[#1E1E24] outline-none placeholder:text-[#A8A29E]"
          />
        </label>
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              filter === item.id ? "border-[#1E1E24] bg-[#1E1E24] text-white" : "border-[#E7E2DA] bg-white text-[#5C5854]"
            }`}
          >
            {item.label}
          </button>
        ))}
        <a
          href="/api/admin/users/export"
          className="inline-flex items-center gap-2 rounded-xl bg-[#7C3AED] px-4 py-2 text-sm font-medium text-white hover:bg-[#6D28D9]"
        >
          <Download className="size-4" />
          Descargar respaldo
        </a>
      </div>
      <p className="-mt-2 text-xs text-[#8A8680]">El respaldo se descarga en CSV y abre directo en Excel y Numbers.</p>

      <div className="overflow-hidden rounded-3xl border border-[#E7E2DA] bg-white">
        {visible.length === 0 ? (
          <p className="p-8 text-center text-sm text-[#8A8680]">Sin cuentas para este filtro.</p>
        ) : (
          <ul className="divide-y divide-[#F0ECE6]">
            {visible.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(openId === user.id ? null : user.id)}
                  className="grid w-full gap-2 px-5 py-4 text-left transition-colors hover:bg-[#FAF8F5] md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-[#1E1E24]">
                      {user.name}
                      {user.isAdmin ? <ShieldCheck className="size-4 shrink-0 text-[#7C3AED]" /> : null}
                    </p>
                    <p className="truncate text-xs text-[#8A8680]">
                      @{user.username} · {user.email}
                    </p>
                  </div>
                  <p className="text-sm text-[#5C5854]">
                    {user.pendingPackage ? `${planLabel(user.pendingPackage)} (por pagar)` : planLabel(user.packageId)}
                  </p>
                  <p className="text-sm text-[#5C5854]">{formatCredits(user.credits)} créditos</p>
                  <Status user={user} />
                </button>
                {openId === user.id ? <UserEditor key={user.id} user={user} onClose={() => setOpenId(null)} /> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function UserEditor({ user, onClose }: { user: AdminUserRow; onClose: () => void }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [password, setPassword] = useState("");
  const [shownPassword, setShownPassword] = useState<string | null>(null);
  const [days, setDays] = useState("7");

  function run<T extends { ok: boolean }>(action: () => Promise<T>, success: string, after?: (result: T) => void) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error((result as unknown as { error: string }).error);
        return;
      }
      toast.success(success);
      after?.(result);
      router.refresh();
    });
  }

  function credits(sign: 1 | -1) {
    const amount = Number.parseInt(creditAmount, 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Escribe cuántos créditos.");
      return;
    }
    run(
      () => adjustCredits(user.id, sign * amount, creditNote),
      sign > 0 ? `${amount} créditos añadidos` : `${amount} créditos retirados`,
      () => {
        setCreditAmount("");
        setCreditNote("");
      },
    );
  }

  function suspend() {
    const value = days === "indefinite" ? "indefinite" : Number.parseInt(days, 10);
    const label = value === "indefinite" ? "sin fecha de regreso" : `${value} días`;
    if (!window.confirm(`¿Suspender a ${user.name} ${label}? No podrá entrar hasta que se reactive.`)) return;
    run(() => suspendAccount(user.id, value), "Cuenta suspendida");
  }

  function remove() {
    const typed = window.prompt(
      `Para borrar a ${user.name} de forma definitiva escribe su usuario: ${user.username}\nSu equipo pasa a su patrocinador.`,
    );
    if (typed === null) return;
    if (typed.trim() !== user.username) {
      toast.error("El usuario escrito no coincide.");
      return;
    }
    run(() => deleteAccount(user.id), "Cuenta borrada", onClose);
  }

  const field = "w-full rounded-lg border border-[#E7E2DA] bg-white px-3 py-2 text-sm text-[#1E1E24] outline-none focus:border-[#7C3AED]";
  const panel = "rounded-2xl border border-[#F0ECE6] bg-[#FCFBF9] p-4";
  const title = "text-xs font-semibold tracking-[0.14em] text-[#8A8680] uppercase";
  const primary = "rounded-lg bg-[#1E1E24] px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
  const secondary = "rounded-lg border border-[#E7E2DA] bg-white px-3 py-2 text-sm font-medium text-[#1E1E24] disabled:opacity-50";

  return (
    <div className="space-y-4 border-t border-[#F0ECE6] bg-[#FAF8F5] px-5 py-5">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#5C5854]">
        <span>Alta: {shortDate(user.createdAt)}</span>
        <span>Patrocinador: {user.sponsorName ?? "—"}</span>
        <span>Directos: {user.referrals}</span>
        <span>Comisiones: {formatUsd(user.walletBalance)}</span>
        <span>Créditos de activación: {formatCredits(user.activationCredits)}</span>
      </div>

      {user.pendingPackage ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#FEDF89] bg-[#FFFAEB] p-4">
          <p className="text-sm text-[#B54708]">
            Registro {planLabel(user.pendingPackage)} esperando pago. Al validarlo se activa el plan, recibe sus créditos y
            se pagan las comisiones de su red.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`¿Validar el registro ${planLabel(user.pendingPackage)} de ${user.name}?`)) {
                run(() => validateRegistration(user.id), "Registro validado");
              }
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-[#067647] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <UserCheck className="size-4" />
            Validar registro
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={panel}>
          <p className={title}>Datos de acceso</p>
          <div className="mt-3 space-y-2">
            <input value={name} onChange={(event) => setName(event.target.value)} className={field} placeholder="Nombre" />
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={field}
              placeholder="Correo"
              type="email"
            />
            <button
              type="button"
              disabled={busy || (name === user.name && email === user.email)}
              onClick={() => run(() => updateProfile(user.id, { name, email }), "Datos guardados")}
              className={primary}
            >
              Guardar datos
            </button>
          </div>
        </div>

        <div className={panel}>
          <p className={title}>Créditos · saldo actual {formatCredits(user.credits)}</p>
          <div className="mt-3 space-y-2">
            <input
              value={creditAmount}
              onChange={(event) => setCreditAmount(event.target.value.replace(/\D/g, ""))}
              className={field}
              placeholder="Cantidad"
              inputMode="numeric"
            />
            <input
              value={creditNote}
              onChange={(event) => setCreditNote(event.target.value)}
              className={field}
              placeholder="Motivo (opcional)"
            />
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => credits(1)} className={primary}>
                Añadir créditos
              </button>
              <button type="button" disabled={busy} onClick={() => credits(-1)} className={secondary}>
                Quitar créditos
              </button>
            </div>
          </div>
        </div>

        <div className={panel}>
          <p className={title}>Contraseña</p>
          <p className="mt-2 text-xs leading-5 text-[#5C5854]">
            Las contraseñas se guardan cifradas. Escribe una nueva o deja el campo vacío para generar una; se muestra aquí
            una sola vez para que se la compartas.
          </p>
          <div className="mt-3 space-y-2">
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={field}
              placeholder="Nueva contraseña (mínimo 8)"
              type="text"
              autoComplete="off"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(() => resetPassword(user.id, password), "Contraseña actualizada", (result) => {
                  setShownPassword((result as { password: string }).password);
                  setPassword("");
                })
              }
              className={`${primary} inline-flex items-center gap-2`}
            >
              <KeyRound className="size-4" />
              {password.trim() ? "Guardar contraseña" : "Generar contraseña"}
            </button>
            {shownPassword ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-[#D9CCFB] bg-[#F5F0FF] px-3 py-2">
                <code className="text-sm font-semibold text-[#5B21B6]">{shownPassword}</code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(shownPassword);
                    toast.success("Contraseña copiada");
                  }}
                  className="text-[#5B21B6]"
                  aria-label="Copiar contraseña"
                >
                  <Copy className="size-4" />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className={panel}>
          <p className={title}>Estado de la cuenta</p>
          {user.isAdmin ? (
            <p className="mt-3 text-sm text-[#5C5854]">La cuenta administradora siempre queda activa.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {user.suspendedUntil ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => suspendAccount(user.id, "lift"), "Cuenta reactivada")}
                  className={`${primary} inline-flex items-center gap-2`}
                >
                  <UserCheck className="size-4" />
                  Reactivar cuenta
                </button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <select value={days} onChange={(event) => setDays(event.target.value)} className={`${field} w-auto`}>
                    <option value="1">1 día</option>
                    <option value="3">3 días</option>
                    <option value="7">7 días</option>
                    <option value="15">15 días</option>
                    <option value="30">30 días</option>
                    <option value="90">90 días</option>
                    <option value="indefinite">Hasta reactivarla</option>
                  </select>
                  <button type="button" disabled={busy} onClick={suspend} className={`${secondary} inline-flex items-center gap-2`}>
                    <UserX className="size-4" />
                    Suspender
                  </button>
                </div>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={remove}
                className="inline-flex items-center gap-2 rounded-lg border border-[#FDA29B] bg-white px-3 py-2 text-sm font-medium text-[#B42318] disabled:opacity-50"
              >
                <Trash2 className="size-4" />
                Borrar cuenta
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
