"use client";

import Link from "next/link";
import { useState } from "react";

import { addProjectRow } from "@/app/dashboard/projects/actions";
import { brand } from "@/config/brand";
import type { ProjectRunView } from "@/lib/project-runtime";
import type { ProjectBlock, ProjectInterface } from "@/lib/project-ui";
import type { ProjectRecord, ProjectRowRecord } from "@/lib/project-tables";

function rowLabel(columns: string[], values: Record<string, string>) {
  return columns
    .map((column) => (values[column] ? `${column}: ${values[column]}` : ""))
    .filter((item) => item.length > 0)
    .join(" · ");
}

function EntryForm({
  projectId,
  block,
  onCreated,
  onRuns,
}: {
  projectId: string;
  block: Extract<ProjectBlock, { kind: "form" }>;
  onCreated: (table: string, row: ProjectRowRecord) => void;
  onRuns: (runs: ProjectRunView[]) => void;
}) {
  const [sent, setSent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="rounded-xl border border-[#E7E2DA] bg-[#F9F8F6] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const values = Object.fromEntries(
          block.fields.map((field, index) => [field, String(data.get(`campo-${index}`) ?? "").trim()]),
        );
        const form = event.currentTarget;
        setSaving(true);
        setSent(null);
        void addProjectRow(projectId, block.table, values).then((result) => {
          setSaving(false);
          if (!result.ok) {
            setSent(result.error);
            return;
          }
          onCreated(block.table, result.row);
          if (result.runs.length > 0) onRuns(result.runs);
          form.reset();
          const agent = result.runs[0]?.agentName;
          setSent(agent ? `Guardado en ${block.table}. ${agent} ya corrió.` : `Guardado en ${block.table}.`);
        });
      }}
    >
      <p className="font-medium text-[#1E1E24]">{block.title}</p>
      <p className="mt-1 text-xs text-[#8A8680]">Tabla {block.table}</p>
      <div className="mt-3 space-y-3">
        {block.fields.map((field, index) => (
          <label key={`${field}-${index}`} className="block text-sm text-[#5C5854]">
            {field}
            <input
              name={`campo-${index}`}
              className="mt-1 w-full rounded-lg border border-[#D9D5CE] bg-white px-3 py-2 text-[#1E1E24] outline-none focus:border-[#7C3AED]"
            />
          </label>
        ))}
      </div>
      <button
        type="submit"
        disabled={saving}
        className="mt-4 rounded-lg bg-[#312F2F] px-4 py-2 text-sm text-white hover:bg-[#1E1E24] disabled:opacity-60"
      >
        {saving ? "Guardando…" : block.submit}
      </button>
      {sent ? (
        <p role="status" className="mt-3 text-sm text-[#7C3AED]">
          {sent}
        </p>
      ) : null}
    </form>
  );
}

function BlockView({
  projectId,
  block,
  records,
  onCreated,
  onRuns,
}: {
  projectId: string;
  block: ProjectBlock;
  records: ProjectRecord[];
  onCreated: (table: string, row: ProjectRowRecord) => void;
  onRuns: (runs: ProjectRunView[]) => void;
}) {
  if (block.kind === "text") {
    return <p className="text-sm leading-relaxed text-[#5C5854]">{block.body}</p>;
  }

  if (block.kind === "stats") {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {block.items.map((item) => (
          <div key={item.label} className="rounded-xl bg-[#F4F1EC] px-4 py-3">
            <p className="text-xs text-[#8A8680]">{item.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-[#1E1E24]">{item.value}</p>
          </div>
        ))}
      </div>
    );
  }

  if (block.kind === "list") {
    const table = records.find((item) => item.name === block.table);
    const rows = table?.rows ?? [];
    return (
      <div>
        <p className="font-medium text-[#1E1E24]">{block.title}</p>
        <p className="mt-1 text-xs text-[#8A8680]">Tabla {block.table}</p>
        {rows.length === 0 ? (
          <>
            <p className="mt-3 text-sm text-[#5C5854]">Todavía no hay registros.</p>
            <ul className="mt-2 divide-y divide-[#E7E2DA]">
              {block.items.map((item, index) => (
                <li key={`${item}-${index}`} className="py-2 text-sm text-[#8A8680]">
                  {item}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <ul className="mt-2 divide-y divide-[#E7E2DA]">
            {rows.map((row) => (
              <li key={row.id} className="py-2 text-sm text-[#5C5854]">
                {rowLabel(table?.columns ?? [], row.values)}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return <EntryForm projectId={projectId} block={block} onCreated={onCreated} onRuns={onRuns} />;
}

export function ProjectApp({
  projectId,
  spec,
  records,
  runs,
}: {
  projectId: string;
  spec: ProjectInterface;
  records: ProjectRecord[];
  runs: ProjectRunView[];
}) {
  const [screenIndex, setScreenIndex] = useState(0);
  const [tables, setTables] = useState(records);
  const [activity, setActivity] = useState(runs);
  const screen = spec.screens[screenIndex] ?? spec.screens[0];

  function onCreated(table: string, row: ProjectRowRecord) {
    setTables((current) =>
      current.map((item) => (item.name === table ? { ...item, rows: [row, ...item.rows] } : item)),
    );
  }

  function onRuns(next: ProjectRunView[]) {
    setActivity((current) => [...next, ...current].slice(0, 6));
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[#8A8680]">Interfaz</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1E1E24] sm:text-4xl">{spec.title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5C5854]">{spec.summary}</p>
        </div>
        <Link href={brand.links.dashboard} className="shrink-0 text-sm text-[#7C3AED]">
          Volver
        </Link>
      </div>

      <section className="mb-6 rounded-2xl border border-[#D9D5CE] bg-white p-5">
        <h2 className="text-sm font-semibold tracking-tight text-[#1E1E24]">Tablas de este proyecto</h2>
        <ul className="mt-3 space-y-2">
          {tables.map((table) => (
            <li key={table.name} className="text-sm text-[#5C5854]">
              <span className="font-medium text-[#1E1E24]">{table.name}</span>
              {" · "}
              {table.columns.join(", ")}
              {" · "}
              {table.rows.length} {table.rows.length === 1 ? "registro" : "registros"}
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-6 rounded-2xl border border-[#D9D5CE] bg-white p-5">
        <h2 className="text-sm font-semibold tracking-tight text-[#1E1E24]">Agentes en ejecución</h2>
        <ul className="mt-3 space-y-3">
          {spec.agents.map((agent) => (
            <li key={agent.name}>
              <p className="text-sm text-[#1E1E24]">
                <span className="font-medium">{agent.name}</span>
                {" · Corriendo"}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[#5C5854]">{agent.instruction}</p>
            </li>
          ))}
        </ul>
        <ul className="mt-4 space-y-1">
          {spec.flows.map((flow) => (
            <li key={flow.name} className="text-sm text-[#5C5854]">
              Al entrar un registro en {flow.table}, corre {flow.agent}.
            </li>
          ))}
        </ul>
        {activity.length === 0 ? (
          <p className="mt-4 text-sm text-[#5C5854]">El flujo corre en cuanto guardas un registro.</p>
        ) : (
          <div className="mt-4 space-y-3 border-t border-[#E7E2DA] pt-4">
            {activity.slice(0, 3).map((run) => (
              <p key={run.id} className="text-sm leading-relaxed text-[#1E1E24]">
                <span className="text-[#7C3AED]">{run.agentName}</span>
                {": "}
                {run.output}
              </p>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#D9D5CE] bg-white">
        <div className="flex gap-2 overflow-x-auto border-b border-[#E7E2DA] px-4 py-3">
          {spec.screens.map((item, index) => (
            <button
              key={`${item.name}-${index}`}
              type="button"
              aria-pressed={index === screenIndex}
              onClick={() => setScreenIndex(index)}
              className={
                index === screenIndex
                  ? "rounded-full bg-[#7C3AED] px-3 py-1.5 text-sm text-white"
                  : "rounded-full bg-[#F4F1EC] px-3 py-1.5 text-sm text-[#1E1E24]"
              }
            >
              {item.name}
            </button>
          ))}
        </div>
        <div className="space-y-5 p-5 sm:p-6">
          <h2 className="text-xl font-semibold tracking-tight text-[#1E1E24]">{screen.headline}</h2>
          {screen.blocks.map((block, index) => (
            <BlockView
              key={`${block.kind}-${index}`}
              projectId={projectId}
              block={block}
              records={tables}
              onCreated={onCreated}
              onRuns={onRuns}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
