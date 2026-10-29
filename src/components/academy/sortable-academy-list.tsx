"use client";

import { Children, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type SortKind = "module" | "lesson";

export function SortableAcademyList({
  courseId,
  kind,
  parentId,
  itemIds,
  children,
}: {
  courseId: string;
  kind: SortKind;
  parentId?: string;
  itemIds: string[];
  children: ReactNode;
}) {
  const router = useRouter();
  const elements = Children.toArray(children);
  const idsKey = itemIds.join("\0");
  const [ordered, setOrdered] = useState(() => ({ idsKey, itemIds }));
  const order = ordered.idsKey === idsKey ? ordered.itemIds : itemIds;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function drop(targetId: string) {
    if (!draggingId || draggingId === targetId || saving) return;
    const previous = order;
    const next = [...order];
    const from = next.indexOf(draggingId);
    const to = next.indexOf(targetId);
    if (from < 0 || to < 0) return;
    next.splice(to, 0, ...next.splice(from, 1));
    setOrdered({ idsKey, itemIds: next });
    setDraggingId(null);
    setSaving(true);
    try {
      const response = await fetch("/api/academy/creator/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, kind, parentId, itemIds: next }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar el orden.");
      toast.success("Orden guardado.");
      router.refresh();
    } catch (error) {
      setOrdered({ idsKey, itemIds: previous });
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el orden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3" aria-label="Contenido reordenable">
      {order.map((id) => {
        const index = itemIds.indexOf(id);
        const child = elements[index];
        if (index < 0 || !child) return null;
        return (
          <div
            key={id}
            draggable={!saving}
            onDragStart={(event) => {
              event.stopPropagation();
              setDraggingId(id);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void drop(id);
            }}
            onDragEnd={() => setDraggingId(null)}
            className={draggingId === id ? "opacity-50" : ""}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
