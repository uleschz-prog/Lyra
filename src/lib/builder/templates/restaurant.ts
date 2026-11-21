// Plantilla «restaurante con datos en vivo»: comandas por mesero, cocina, caja, inventario por
// receta y resumen por sucursal. Las pantallas son deterministas (no se le piden al modelo): así
// un sistema crítico para operar sale probado y sin variaciones.
import { composeSkeleton } from "@/lib/builder/plan";
import { restaurantApp, restaurantHelpers, restaurantPages } from "@/lib/builder/templates/restaurant-screens";
import type { BuildPlan, Entity, ProjectFiles } from "@/lib/builder/types";

function fold(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const restaurantWords = /\b(restaurante|restaurant|comandas?|meseros?|taqueria|fonda|cocina economica|cafeteria|marisqueria|pozoleria|loncheria|antojitos|punto de venta de comida)\b/;

/** ¿El encargo es la operación de un restaurante (comandas, cocina, caja)? */
export function isRestaurantBrief(brief: string) {
  const text = fold(brief);
  return restaurantWords.test(text) && /\b(comanda|mesero|cocina|caja|inventario|sucursal|pedido|mesa)/.test(text);
}

const numberWords: Record<string, number> = { una: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 };

/** Sucursales que menciona el encargo («2 sucursales», «tres sucursales»); al menos una. */
export function branchesFromBrief(brief: string) {
  const text = fold(brief);
  const match = text.match(/\b(\d{1,2}|una|un|dos|tres|cuatro|cinco|seis)\s+(sucursales|sucursal|locales|restaurantes)\b/);
  const count = match ? Math.min(6, Math.max(1, Number(match[1]) || numberWords[match[1]] || 1)) : 1;
  if (count === 1) return [{ id: "principal", name: "Principal" }];
  return Array.from({ length: count }, (_, index) => ({ id: "sucursal-" + (index + 1), name: "Sucursal " + (index + 1) }));
}

const insumos = [
  { id: "tortilla", nombre: "Tortilla", unidad: "kg", minimo: 5 },
  { id: "masa", nombre: "Masa de maíz", unidad: "kg", minimo: 5 },
  { id: "cecina", nombre: "Cecina", unidad: "kg", minimo: 3 },
  { id: "pollo", nombre: "Pollo deshebrado", unidad: "kg", minimo: 3 },
  { id: "queso", nombre: "Queso fresco", unidad: "kg", minimo: 2 },
  { id: "frijol", nombre: "Frijol", unidad: "kg", minimo: 3 },
  { id: "salsa", nombre: "Salsa de chile seco", unidad: "l", minimo: 2 },
  { id: "cafe", nombre: "Café de olla", unidad: "l", minimo: 3 },
  { id: "jamaica", nombre: "Agua de jamaica", unidad: "l", minimo: 4 },
];

const platillos = [
  { id: "enchiladas", nombre: "Enchiladas huastecas", categoria: "Platos fuertes", precio: 135, receta: [{ insumo: "tortilla", cantidad: 0.15 }, { insumo: "queso", cantidad: 0.05 }, { insumo: "salsa", cantidad: 0.1 }] },
  { id: "cecina-plato", nombre: "Cecina con enchiladas", categoria: "Platos fuertes", precio: 189, receta: [{ insumo: "cecina", cantidad: 0.2 }, { insumo: "tortilla", cantidad: 0.12 }, { insumo: "frijol", cantidad: 0.08 }] },
  { id: "bocoles", nombre: "Bocoles de frijol (3)", categoria: "Antojitos", precio: 85, receta: [{ insumo: "masa", cantidad: 0.18 }, { insumo: "frijol", cantidad: 0.06 }] },
  { id: "tamal", nombre: "Tamal de pollo", categoria: "Antojitos", precio: 45, receta: [{ insumo: "masa", cantidad: 0.12 }, { insumo: "pollo", cantidad: 0.05 }] },
  { id: "quesadillas", nombre: "Quesadillas de queso (2)", categoria: "Entradas", precio: 70, receta: [{ insumo: "masa", cantidad: 0.12 }, { insumo: "queso", cantidad: 0.06 }] },
  { id: "frijoles", nombre: "Frijoles charros", categoria: "Entradas", precio: 55, receta: [{ insumo: "frijol", cantidad: 0.15 }] },
  { id: "cafe-olla", nombre: "Café de olla", categoria: "Bebidas", precio: 35, receta: [{ insumo: "cafe", cantidad: 0.25 }] },
  { id: "agua-jamaica", nombre: "Agua de jamaica (litro)", categoria: "Bebidas", precio: 45, receta: [{ insumo: "jamaica", cantidad: 1 }] },
  { id: "pemoles", nombre: "Pemoles", categoria: "Postres", precio: 40, receta: [{ insumo: "masa", cantidad: 0.05 }] },
];

const startingStock: Record<string, number> = { tortilla: 20, masa: 18, cecina: 8, pollo: 6, queso: 6, frijol: 10, salsa: 6, cafe: 12, jamaica: 15 };

function entities(branches: { id: string; name: string }[]): Entity[] {
  return [
    {
      key: "platillos",
      label: "Platillos",
      singular: "Platillo",
      icon: "UtensilsCrossed",
      scope: "shared",
      sync: "all",
      write: ["admin"],
      fields: [
        { key: "nombre", label: "Nombre", type: "text", required: true },
        { key: "categoria", label: "Categoría", type: "select", options: ["Entradas", "Platos fuertes", "Antojitos", "Bebidas", "Postres"] },
        { key: "precio", label: "Precio", type: "money", required: true },
        { key: "activo", label: "Activo", type: "boolean" },
        { key: "receta", label: "Receta", type: "items", fields: [{ key: "insumo", label: "Insumo", type: "ref", ref: "insumos" }, { key: "cantidad", label: "Cantidad", type: "number" }] },
      ],
      seed: platillos.map((item) => ({ ...item, activo: true })),
    },
    {
      key: "insumos",
      label: "Insumos",
      singular: "Insumo",
      icon: "Package",
      scope: "shared",
      sync: "all",
      write: ["admin"],
      fields: [
        { key: "nombre", label: "Nombre", type: "text", required: true },
        { key: "unidad", label: "Unidad", type: "select", options: ["kg", "g", "l", "pza"] },
        { key: "minimo", label: "Mínimo", type: "number" },
      ],
      seed: insumos,
    },
    {
      key: "existencias",
      label: "Existencias",
      singular: "Existencia",
      icon: "Boxes",
      scope: "branch",
      sync: "all",
      write: [],
      fields: [
        { key: "insumo", label: "Insumo", type: "ref", ref: "insumos", required: true },
        { key: "cantidad", label: "Cantidad", type: "number" },
      ],
      seed: branches.flatMap((branch) => insumos.map((item) => ({ id: branch.id + "_" + item.id, branchId: branch.id, insumo: item.id, cantidad: startingStock[item.id] ?? 0 }))),
    },
    {
      key: "comandas",
      label: "Comandas",
      singular: "Comanda",
      icon: "Receipt",
      scope: "branch",
      sync: "recent",
      write: [],
      fields: [
        { key: "mesa", label: "Mesa", type: "text", required: true },
        { key: "mesero", label: "Mesero", type: "text" },
        { key: "estado", label: "Estado", type: "select", options: ["En cocina", "Lista", "Entregada", "Pagada", "Cancelada"] },
        {
          key: "items",
          label: "Platillos",
          type: "items",
          fields: [
            { key: "platillo", label: "Platillo", type: "ref", ref: "platillos" },
            { key: "nombre", label: "Nombre", type: "text" },
            { key: "cantidad", label: "Cantidad", type: "number" },
            { key: "precio", label: "Precio", type: "money" },
            { key: "nota", label: "Nota", type: "text" },
          ],
        },
        { key: "total", label: "Total", type: "money" },
        { key: "metodo", label: "Forma de pago", type: "select", options: ["Efectivo", "Tarjeta", "Transferencia"] },
        { key: "propina", label: "Propina", type: "money" },
        { key: "cerradaEn", label: "Cobrada", type: "text" },
      ],
      seed: [],
    },
    {
      key: "movimientos",
      label: "Movimientos de inventario",
      singular: "Movimiento",
      icon: "ClipboardList",
      scope: "branch",
      sync: "recent",
      write: ["caja"],
      fields: [
        { key: "tipo", label: "Tipo", type: "select", options: ["Compra", "Merma", "Conteo"] },
        { key: "insumo", label: "Insumo", type: "ref", ref: "insumos", required: true },
        { key: "cantidad", label: "Cantidad", type: "number" },
        { key: "nota", label: "Nota", type: "text" },
        { key: "persona", label: "Registró", type: "text" },
      ],
      seed: [],
    },
  ];
}

const pages = [
  { path: "/", name: "Inicio", title: "Inicio" },
  { path: "/mesero", name: "Mesero", title: "Tomar pedido" },
  { path: "/cocina", name: "Cocina", title: "Cocina" },
  { path: "/caja", name: "Caja", title: "Caja" },
  { path: "/inventario", name: "Inventario", title: "Inventario" },
  { path: "/resumen", name: "Resumen", title: "Resumen" },
  { path: "/menu", name: "Menu", title: "Menú e insumos" },
];

/** Nombre que Vega puso a la entrega («Nombre: …» en el brief). */
export function titleFromBrief(brief: string) {
  return brief.match(/^Nombre:\s*(.+)$/m)?.[1]?.trim().slice(0, 80) ?? "";
}

/** Plan completo del restaurante (sin llamada al modelo). */
export function restaurantPlan(input: { brief: string; title: string }): BuildPlan {
  const branches = branchesFromBrief(input.brief);
  const title = input.title.trim().slice(0, 80) || titleFromBrief(input.brief) || "Restaurante";
  return {
    version: 1,
    kind: "app",
    title,
    summary: `Operación de ${title}: comandas de meseros, pantalla de cocina, caja con corte del día, inventario por receta y resumen por sucursal, con datos en vivo.`,
    brand: { name: title, tagline: "Comandas, cocina, caja e inventario en tiempo real" },
    designSystem: composeSkeleton(input.brief, "app").system.id,
    chrome: [],
    pages: pages.map((page) => ({ ...page, sections: [] })),
    entities: entities(branches),
    live: {
      roles: [
        { key: "mesero", label: "Mesero" },
        { key: "cocina", label: "Cocina" },
        { key: "caja", label: "Caja" },
      ],
      branches,
    },
    suggestions: ["Renombrar las sucursales y dar de alta al equipo con su PIN en Proyectos", "Cargar el menú real con su receta para descontar inventario"],
    assumptions: ["Menú, insumos y existencias iniciales son de ejemplo: ajústalos en «Menú e insumos» e «Inventario»."],
  };
}

/** Archivos propios de la plantilla (se suman al andamiaje y reemplazan App y páginas). */
export function restaurantFiles(plan: BuildPlan): ProjectFiles {
  return { "src/App.tsx": restaurantApp, "src/pages/restaurante.ts": restaurantHelpers(plan.title), ...restaurantPages };
}
