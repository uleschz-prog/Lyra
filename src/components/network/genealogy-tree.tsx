"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { formatUsd, initials, rankBadge, rankLabel } from "@/lib/format";
import type { NetworkNode } from "@/lib/types";
import { cn } from "@/lib/utils";

function collect(node: NetworkNode): NetworkNode[] {
  return [node, ...node.children.flatMap(collect)];
}

function findNode(node: NetworkNode, id: string): NetworkNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const match = findNode(child, id);
    if (match) return match;
  }
  return null;
}

function NodeCard({
  node,
  selected,
  open,
  onSelect,
  onToggle,
}: {
  node: NetworkNode;
  selected: boolean;
  open: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;

  return (
    <div
      className={cn(
        "relative flex items-center gap-3 overflow-hidden rounded-xl border bg-surface/80 px-3 py-3 text-left backdrop-blur-md transition-colors",
        selected
          ? "border-accent-purple"
          : "border-border hover:border-[#C9C3BA]",
      )}
    >
      <button type="button" onClick={() => onSelect(node.id)} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-[#F4F1EC] text-xs text-[#1E1E24]">
          {initials(node.name)}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm text-[#1E1E24]">{node.name}</span>
            {node.depth === 0 ? (
              <span className="text-[10px] uppercase tracking-[0.16em] text-lyra-cyan">Tú</span>
            ) : null}
          </span>
          <span className="mt-1 flex items-center gap-2">
            <Badge variant={rankBadge(node.rank)}>{rankLabel[node.rank]}</Badge>
            <span className="text-xs text-[#8A8680]">
              {node.children.length === 1
                ? "1 directo"
                : `${node.children.length} directos`}
            </span>
          </span>
        </span>
      </button>
      {hasChildren ? (
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? `Contraer la línea de ${node.name}` : `Expandir la línea de ${node.name}`}
          onClick={() => onToggle(node.id)}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#5C5854] hover:bg-[#F4F1EC] hover:text-[#1E1E24]"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      ) : null}
    </div>
  );
}

function Branch({
  node,
  selectedId,
  openIds,
  onSelect,
  onToggle,
}: {
  node: NetworkNode;
  selectedId: string;
  openIds: Record<string, boolean>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const open = openIds[node.id] ?? true;

  return (
    <li className="relative">
      <NodeCard
        node={node}
        selected={selectedId === node.id}
        open={open}
        onSelect={onSelect}
        onToggle={onToggle}
      />
      {open && node.children.length > 0 ? (
        <ul className="mt-3 space-y-3 border-l border-lyra-violet/25 pl-4 sm:ml-5 sm:pl-5">
          {node.children.map((child) => (
            <Branch
              key={child.id}
              node={child}
              selectedId={selectedId}
              openIds={openIds}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function GenealogyTree({ root }: { root: NetworkNode }) {
  const [selectedId, setSelectedId] = useState(root.id);
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const nodes = useMemo(() => collect(root), [root]);
  const selected = findNode(root, selectedId) ?? root;
  const maxDepth = nodes.reduce((max, node) => Math.max(max, node.depth), 0);

  function toggle(id: string) {
    setOpenIds((current) => ({
      ...current,
      [id]: current[id] === false,
    }));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section className="space-y-5">
        <dl className="grid gap-3 sm:grid-cols-3">
          {[
            ["Directos", String(root.children.length)],
            ["En el árbol", String(nodes.length - 1)],
            ["Profundidad", String(maxDepth)],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-2xl border border-border bg-surface/80 backdrop-blur-md transition-colors hover:border-border-bright px-4 py-3"
            >
              <dt className="text-[10px] uppercase tracking-[0.2em] text-[#8A8680]">{label}</dt>
              <dd className="mt-1 text-xl tabular-nums text-[#1E1E24]">{value}</dd>
            </div>
          ))}
        </dl>
        <ul>
          <Branch
            node={root}
            selectedId={selectedId}
            openIds={openIds}
            onSelect={setSelectedId}
            onToggle={toggle}
          />
        </ul>
      </section>

      <aside className="h-fit rounded-2xl border border-border bg-surface/80 backdrop-blur-md transition-colors hover:border-border-bright p-5">
        <p className="text-[10px] uppercase tracking-[0.22em] text-lyra-cyan">Ficha</p>
        <h2 className="mt-3 text-xl tracking-wide text-[#1E1E24]">{selected.name}</h2>
        <div className="mt-3">
          <Badge variant={rankBadge(selected.rank)}>{rankLabel[selected.rank]}</Badge>
        </div>
        <dl className="mt-6 space-y-4 text-sm">
          <div>
            <dt className="text-[#8A8680]">Correo</dt>
            <dd className="mt-1 text-[#1E1E24]">{selected.email}</dd>
          </div>
          <div>
            <dt className="text-[#8A8680]">Patrocinador</dt>
            <dd className="mt-1 text-[#1E1E24]">{selected.sponsorName}</dd>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-[#8A8680]">Nivel</dt>
              <dd className="mt-1 text-[#1E1E24]">{selected.depth}</dd>
            </div>
            <div>
              <dt className="text-[#8A8680]">Directos</dt>
              <dd className="mt-1 text-[#1E1E24]">{selected.children.length}</dd>
            </div>
          </div>
          <div>
            <dt className="text-[#8A8680]">Volumen personal</dt>
            <dd className="mt-1 text-[#1E1E24]">{formatUsd(selected.personalVolume)}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
