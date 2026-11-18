export type PanelVariant = "sheet" | "pane";

/** Hoja flotante (móvil abajo; escritorio arriba a la derecha). */
export const sheetClass =
  "fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-3xl border-t border-[#E7E2DA] bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl md:absolute md:inset-x-auto md:top-14 md:right-3 md:bottom-auto md:max-h-[calc(100%-5rem)] md:w-[min(400px,calc(100%-1.5rem))] md:rounded-2xl md:border md:pb-4 md:shadow-xl";

/** Vega v2: el mismo panel dentro de la columna de información (sin flotar). */
export const paneClass = "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-4";

export function panelClass(variant: PanelVariant = "sheet") {
  return variant === "pane" ? paneClass : sheetClass;
}
