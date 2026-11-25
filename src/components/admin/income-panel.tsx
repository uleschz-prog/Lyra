"use client";

import {
  Download,
  History,
  Info,
  Pencil,
  Plus,
  Search,
  Wallet,
  X,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  formatIncomeDate,
  incomeCurrencies,
  type IncomeEditView,
  type IncomeFilters,
  incomeMethods,
  type IncomeReport,
  type IncomeRow,
  type IncomeTotals,
  incomeTypes,
  manualMethods,
  methodLabel,
  typeLabel,
} from "@/lib/admin/income";

function money(value: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(
    value,
  );
}

function queryOf(filters: IncomeFilters) {
  const params = new URLSearchParams();
  if (filters.from) params.set("desde", filters.from);
  else params.set("todo", "1");
  if (filters.to) params.set("hasta", filters.to);
  if (filters.type) params.set("tipo", filters.type);
  if (filters.method) params.set("metodo", filters.method);
  if (filters.source) params.set("origen", filters.source);
  if (filters.userId) params.set("usuario", filters.userId);
  if (filters.q) params.set("q", filters.q);
  if (filters.includeUnpaid) params.set("sinCobro", "1");
  return params.toString();
}

const field =
  "rounded-lg border border-[#E7E2DA] bg-white px-3 py-2 text-sm text-[#1E1E24] outline-none focus:border-[#C4B5FD]";

function TotalsCard({
  title,
  totals,
  hint,
}: {
  title: string;
  totals: IncomeTotals;
  hint: string;
}) {
  const currencies = Object.keys(totals);
  return (
    <div className="rounded-2xl border border-[#E7E2DA] bg-white p-4">
      <p className="text-[11px] font-medium tracking-[0.22em] text-[#7C3AED] uppercase">
        {title}
      </p>
      {currencies.length === 0 ? (
        <p className="mt-2 text-2xl font-bold tracking-tight text-[#1E1E24]">
          {money(0, "USD")}
        </p>
      ) : (
        currencies.map((currency) => (
          <div key={currency} className="mt-2">
            <p className="text-2xl font-bold tracking-tight text-[#1E1E24]">
              {money(totals[currency].total, currency)}
              <span className="ml-2 text-xs font-medium text-[#8A8680]">
                {currency} · {totals[currency].count}{" "}
                {totals[currency].count === 1 ? "pago" : "pagos"}
              </span>
            </p>
            <ul className="mt-2 space-y-0.5 text-xs text-[#5C5854]">
              {Object.entries(totals[currency].byType).map(([type, bucket]) => (
                <li key={type} className="flex justify-between gap-3">
                  <span>{typeLabel[type as keyof typeof typeLabel]}</span>
                  <span className="tabular-nums">
                    {money(bucket!.total, currency)}
                  </span>
                </li>
              ))}
            </ul>
            <ul className="mt-2 flex flex-wrap gap-1">
              {Object.entries(totals[currency].byMethod).map(
                ([method, bucket]) => (
                  <li
                    key={method}
                    className="rounded-full bg-[#F3F0EA] px-2 py-0.5 text-[11px] text-[#5C5854]"
                  >
                    {methodLabel[method as keyof typeof methodLabel]} ·{" "}
                    {money(bucket!.total, currency)}
                  </li>
                ),
              )}
            </ul>
          </div>
        ))
      )}
      <p className="mt-3 text-[11px] text-[#8A8680]">{hint}</p>
    </div>
  );
}

function EditDialog({
  row,
  onClose,
  onSaved,
}: {
  row: IncomeRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(row.amount.toFixed(2));
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<IncomeEditView[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadHistory() {
    const response = await fetch(
      `/api/admin/ingresos/${encodeURIComponent(row.key)}`,
      { cache: "no-store" },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      edits?: IncomeEditView[];
      error?: string;
    };
    if (!response.ok)
      return toast.error(payload.error ?? "No se pudo cargar el historial.");
    setHistory(payload.edits ?? []);
  }

  async function save() {
    setBusy(true);
    const response = await fetch(
      `/api/admin/ingresos/${encodeURIComponent(row.key)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount, reason }),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setBusy(false);
    if (!response.ok)
      return toast.error(payload.error ?? "No se pudo guardar el cambio.");
    toast.success("Monto actualizado", {
      description: "El pago original queda guardado en el historial.",
    });
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="income-edit-title"
    >
      <div className="w-full max-w-lg rounded-3xl border border-[#E7E2DA] bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium tracking-[0.22em] text-[#7C3AED] uppercase">
              Editar monto
            </p>
            <h2
              id="income-edit-title"
              className="mt-1 text-lg font-bold tracking-tight text-[#1E1E24]"
            >
              {typeLabel[row.type]} · {row.userName}
            </h2>
            <p className="mt-1 text-xs text-[#8A8680]">
              {formatIncomeDate(row.at)} · {methodLabel[row.method]} · original{" "}
              {money(row.originalAmount, row.currency)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1 text-[#8A8680] hover:bg-[#F3F0EA]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-4 flex gap-2 rounded-xl bg-[#FFF7ED] px-3 py-2 text-xs leading-5 text-[#9A3412]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Solo cambia el registro contable. No modifica créditos, wallet ni
          comisiones del socio, y el monto original del pago se conserva.
        </p>
        <label className="mt-4 block text-sm font-medium text-[#1E1E24]">
          Monto que entró ({row.currency})
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            className={`${field} mt-1 w-full`}
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-[#1E1E24]">
          Motivo del cambio
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Ej. comisión de Mercado Pago descontada; el depósito real fue menor"
            className={`${field} mt-1 w-full`}
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          {row.editCount > 0 ? (
            <button
              type="button"
              onClick={loadHistory}
              className="inline-flex items-center gap-1 text-sm text-[#7C3AED] hover:underline"
            >
              <History className="h-4 w-4" /> Ver historial ({row.editCount})
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[#E7E2DA] px-3 py-1.5 text-sm"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy || reason.trim().length < 3}
              className="rounded-md bg-[#7C3AED] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Guardando…" : "Guardar cambio"}
            </button>
          </div>
        </div>
        {history ? (
          <ol className="mt-4 max-h-48 space-y-2 overflow-y-auto border-t border-[#E7E2DA] pt-3 text-xs text-[#5C5854]">
            {history.map((edit) => (
              <li key={edit.id}>
                <span className="font-medium text-[#1E1E24]">
                  {money(edit.previousAmount, row.currency)} →{" "}
                  {money(edit.newAmount, row.currency)}
                </span>{" "}
                · {edit.editedByName} · {formatIncomeDate(edit.createdAt)}
                <p className="text-[#8A8680]">{edit.reason}</p>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}

function ManualForm({
  today,
  onSaved,
}: {
  today: string;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    user: "",
    type: "inscripcion",
    method: "transferencia",
    currency: "USD",
    amount: "",
    date: today,
    reference: "",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const set =
    (key: keyof typeof form) => (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  async function save() {
    setBusy(true);
    const response = await fetch("/api/admin/ingresos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setBusy(false);
    if (!response.ok)
      return toast.error(payload.error ?? "No se pudo registrar el ingreso.");
    toast.success("Ingreso registrado");
    setForm((current) => ({
      ...current,
      user: "",
      amount: "",
      reference: "",
      note: "",
    }));
    onSaved();
  }

  return (
    <div className="mt-4 rounded-2xl border border-[#E7E2DA] bg-white p-4">
      <p className="text-sm font-semibold text-[#1E1E24]">
        Registrar un ingreso manual
      </p>
      <p className="mt-1 text-xs text-[#8A8680]">
        Para dinero que entró fuera de la plataforma (efectivo, transferencia…).
        Es solo un registro: no acredita créditos, no activa membresías ni paga
        comisiones.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input
          value={form.user}
          onChange={set("user")}
          placeholder="Socio: correo, usuario o ID"
          className={field}
          aria-label="Socio"
        />
        <select
          value={form.type}
          onChange={set("type")}
          className={field}
          aria-label="Tipo"
        >
          {incomeTypes.map((type) => (
            <option key={type} value={type}>
              {typeLabel[type]}
            </option>
          ))}
        </select>
        <select
          value={form.method}
          onChange={set("method")}
          className={field}
          aria-label="Método"
        >
          {manualMethods.map((method) => (
            <option key={method} value={method}>
              {methodLabel[method]}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <select
            value={form.currency}
            onChange={set("currency")}
            className={`${field} w-24`}
            aria-label="Moneda"
          >
            {incomeCurrencies.map((currency) => (
              <option key={currency}>{currency}</option>
            ))}
          </select>
          <input
            value={form.amount}
            onChange={set("amount")}
            inputMode="decimal"
            placeholder="Monto"
            className={`${field} min-w-0 flex-1`}
            aria-label="Monto"
          />
        </div>
        <input
          type="date"
          value={form.date}
          max={today}
          onChange={set("date")}
          className={field}
          aria-label="Fecha"
        />
        <input
          value={form.reference}
          onChange={set("reference")}
          placeholder="Referencia (opcional)"
          className={field}
          aria-label="Referencia"
        />
        <input
          value={form.note}
          onChange={set("note")}
          placeholder="Nota (opcional)"
          className={`${field} lg:col-span-2`}
          aria-label="Nota"
        />
      </div>
      <button
        type="button"
        onClick={save}
        disabled={busy || !form.user.trim() || !form.amount.trim()}
        className="mt-3 inline-flex items-center gap-1 rounded-md bg-[#7C3AED] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        <Plus className="h-4 w-4" /> {busy ? "Guardando…" : "Registrar ingreso"}
      </button>
    </div>
  );
}

export function IncomePanel({ initial }: { initial: IncomeReport }) {
  const [report, setReport] = useState<IncomeReport>(initial);
  const [filters, setFilters] = useState<IncomeFilters>(initial.filters);
  const [editing, setEditing] = useState<IncomeRow | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [busy, startTransition] = useTransition();
  const query = useMemo(() => queryOf(filters), [filters]);

  function load(next: IncomeFilters = filters) {
    startTransition(async () => {
      const response = await fetch(`/api/admin/ingresos?${queryOf(next)}`, {
        cache: "no-store",
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as IncomeReport & { error?: string };
      if (!response.ok) {
        toast.error(payload.error ?? "No se pudieron cargar los ingresos.");
        return;
      }
      setReport(payload);
      window.history.replaceState(null, "", `?${queryOf(next)}`);
    });
  }

  const update = (patch: Partial<IncomeFilters>) =>
    setFilters((current) => ({ ...current, ...patch }));

  return (
    <section className="space-y-5">
      <p className="flex gap-2 rounded-2xl border border-[#FED7AA] bg-[#FFF7ED] px-4 py-3 text-sm leading-6 text-[#9A3412]">
        <Info className="mt-1 h-4 w-4 shrink-0" aria-hidden />
        <span>
          Esta sección es un registro contable. Editar un monto o registrar un
          ingreso manual{" "}
          <strong>no cambia créditos, wallet ni comisiones</strong> de ningún
          socio; el monto original de cada pago se conserva con su historial de
          cambios.
        </span>
      </p>

      <div className="grid gap-3 lg:grid-cols-3">
        <TotalsCard
          title="Hoy"
          totals={report.totals.today}
          hint={`Día ${report.today} (hora CDMX)`}
        />
        <TotalsCard
          title="Este mes"
          totals={report.totals.month}
          hint={`Desde el ${report.monthStart} (hora CDMX)`}
        />
        <TotalsCard
          title="Rango y filtros"
          totals={report.totals.range}
          hint={`${report.filters.from || "Inicio"} → ${report.filters.to || "hoy"}${report.filters.type || report.filters.method || report.filters.q || report.filters.source ? " · con filtros" : ""}`}
        />
      </div>

      <div className="rounded-3xl border border-[#DDD6FE] bg-gradient-to-br from-[#F5F3FF] via-white to-[#ECFEFF] p-5">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-[#5C5854]">
            Desde
            <input
              type="date"
              value={filters.from ?? ""}
              onChange={(event) => update({ from: event.target.value })}
              className={`${field} mt-1 block`}
            />
          </label>
          <label className="text-xs text-[#5C5854]">
            Hasta
            <input
              type="date"
              value={filters.to ?? ""}
              onChange={(event) => update({ to: event.target.value })}
              className={`${field} mt-1 block`}
            />
          </label>
          <label className="text-xs text-[#5C5854]">
            Tipo
            <select
              value={filters.type ?? ""}
              onChange={(event) =>
                update({ type: event.target.value as IncomeFilters["type"] })
              }
              className={`${field} mt-1 block`}
            >
              <option value="">Todos</option>
              {incomeTypes.map((type) => (
                <option key={type} value={type}>
                  {typeLabel[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[#5C5854]">
            Método
            <select
              value={filters.method ?? ""}
              onChange={(event) =>
                update({
                  method: event.target.value as IncomeFilters["method"],
                })
              }
              className={`${field} mt-1 block`}
            >
              <option value="">Todos</option>
              {incomeMethods.map((method) => (
                <option key={method} value={method}>
                  {methodLabel[method]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[#5C5854]">
            Origen
            <select
              value={filters.source ?? ""}
              onChange={(event) =>
                update({
                  source: event.target.value as IncomeFilters["source"],
                })
              }
              className={`${field} mt-1 block`}
            >
              <option value="">Todos</option>
              <option value="pago">Plataforma</option>
              <option value="manual">Captura manual</option>
            </select>
          </label>
          <label className="min-w-[200px] flex-1 text-xs text-[#5C5854]">
            Buscar
            <span className={`${field} mt-1 flex items-center gap-2`}>
              <Search className="h-4 w-4 text-[#8A8680]" aria-hidden />
              <input
                value={filters.q ?? ""}
                onChange={(event) => update({ q: event.target.value })}
                onKeyDown={(event) => event.key === "Enter" && load()}
                placeholder="Socio, correo, ID o referencia"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </span>
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-xs text-[#5C5854]">
            <input
              type="checkbox"
              checked={Boolean(filters.includeUnpaid)}
              onChange={(event) =>
                update({ includeUnpaid: event.target.checked })
              }
            />
            Mostrar códigos sin cobro
          </label>
          <button
            type="button"
            onClick={() => load()}
            disabled={busy}
            className="rounded-md bg-[#7C3AED] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Cargando…" : "Aplicar"}
          </button>
          <a
            href={`/api/admin/ingresos/export?${query}`}
            className="inline-flex items-center gap-1 rounded-md border border-[#E7E2DA] bg-white px-3 py-2 text-sm text-[#1E1E24]"
          >
            <Download className="h-4 w-4" /> CSV
          </a>
          <button
            type="button"
            onClick={() => setShowManual((value) => !value)}
            className="inline-flex items-center gap-1 rounded-md border border-[#C4B5FD] bg-white px-3 py-2 text-sm text-[#7C3AED]"
          >
            <Plus className="h-4 w-4" /> Ingreso manual
          </button>
        </div>
        {showManual ? (
          <ManualForm today={report.today} onSaved={() => load()} />
        ) : null}
      </div>

      {report.truncated ? (
        <p className="rounded-xl bg-[#FEF3C7] px-3 py-2 text-sm text-[#92400E]">
          Hay demasiados registros: acota el rango de fechas para ver todos.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-3xl border border-[#E7E2DA] bg-white">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-[#FCFBF9] text-xs text-[#8A8680]">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha (CDMX)</th>
              <th className="px-4 py-3 font-medium">Socio</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Método</th>
              <th className="px-4 py-3 text-right font-medium">Monto</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Referencia</th>
              <th className="sticky right-0 bg-[#FCFBF9] px-4 py-3">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0ECE6]">
            {report.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-sm text-[#8A8680]"
                >
                  <Wallet className="mx-auto mb-2 h-6 w-6" aria-hidden />
                  No hay ingresos con estos filtros.
                </td>
              </tr>
            ) : (
              report.rows.map((row) => (
                <tr
                  key={row.key}
                  className={row.status === "sin_cobro" ? "text-[#8A8680]" : ""}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatIncomeDate(row.at)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#1E1E24]">{row.userName}</p>
                    <p className="text-xs text-[#8A8680]">
                      {row.userEmail}
                      {row.username ? ` · @${row.username}` : ""}
                    </p>
                    <p className="font-mono text-[10px] text-[#B5B0A8]">
                      {row.userId ?? "cuenta borrada"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {typeLabel[row.type]}
                    {row.source === "manual" ? (
                      <span className="ml-1 rounded-full bg-[#EEF2FF] px-1.5 py-0.5 text-[10px] text-[#4338CA]">
                        manual
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{methodLabel[row.method]}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                    <p className="font-semibold text-[#1E1E24]">
                      {money(row.amount, row.currency)}
                    </p>
                    {row.edited ? (
                      <p
                        className="text-[11px] text-[#B45309]"
                        title={
                          row.lastEdit
                            ? `${row.lastEdit.reason} — ${row.lastEdit.editedByName}`
                            : undefined
                        }
                      >
                        Editado · original{" "}
                        {money(row.originalAmount, row.currency)}
                      </p>
                    ) : (
                      <p className="text-[11px] text-[#8A8680]">
                        {row.currency}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.status === "pagado" ? (
                      <span className="rounded-full bg-[#E8F7EE] px-2 py-0.5 text-xs text-[#067647]">
                        Pagado
                      </span>
                    ) : (
                      <span className="rounded-full bg-[#F3F0EA] px-2 py-0.5 text-xs text-[#5C5854]">
                        Sin cobro
                      </span>
                    )}
                  </td>
                  <td
                    className="max-w-[150px] truncate px-4 py-3 font-mono text-xs text-[#5C5854]"
                    title={row.reference ?? row.description}
                  >
                    {row.reference ?? "—"}
                  </td>
                  <td className="sticky right-0 bg-white px-4 py-3 text-right">
                    {row.status === "pagado" ? (
                      <button
                        type="button"
                        onClick={() => setEditing(row)}
                        aria-label={`Editar monto de ${row.userName}`}
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-[#E7E2DA] px-2 py-1 text-xs text-[#1E1E24] hover:border-[#C4B5FD]"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[#8A8680]">
        Montos de la plataforma en USD (el valor que cobra LYRA; con Mercado
        Pago el socio paga el equivalente en su moneda más la comisión). Los
        códigos promocionales o de activación se listan como «sin cobro» y no
        suman.
      </p>

      {editing ? (
        <EditDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : null}
    </section>
  );
}
