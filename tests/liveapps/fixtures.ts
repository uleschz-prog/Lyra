// Manifiesto mínimo de prueba: 2 sucursales, meseros y cocina, catálogo compartido, existencias por
// sucursal y comandas recientes.
export const testManifest = {
  version: 1,
  title: "Taquería de prueba",
  roles: [
    { key: "mesero", label: "Mesero" },
    { key: "cocina", label: "Cocina" },
  ],
  branches: [
    { id: "centro", name: "Centro" },
    { id: "norte", name: "Norte" },
  ],
  collections: [
    {
      key: "insumos",
      label: "Insumos",
      singular: "Insumo",
      scope: "shared",
      write: ["admin"],
      fields: [
        { key: "nombre", label: "Nombre", type: "text", required: true },
        { key: "unidad", label: "Unidad", type: "select", options: ["kg", "pza"] },
      ],
      seed: [
        { id: "cecina", nombre: "Cecina", unidad: "kg" },
        { id: "queso", nombre: "Queso", unidad: "kg" },
      ],
    },
    {
      key: "existencias",
      label: "Existencias",
      singular: "Existencia",
      scope: "branch",
      fields: [
        { key: "insumo", label: "Insumo", type: "ref", ref: "insumos", required: true },
        { key: "cantidad", label: "Cantidad", type: "number" },
      ],
      seed: [
        { id: "centro_cecina", branchId: "centro", insumo: "cecina", cantidad: 10 },
        { id: "norte_cecina", branchId: "norte", insumo: "cecina", cantidad: 8 },
      ],
    },
    {
      key: "comandas",
      label: "Comandas",
      singular: "Comanda",
      scope: "branch",
      sync: "recent",
      write: ["mesero", "cocina"],
      fields: [
        { key: "mesa", label: "Mesa", type: "text", required: true },
        { key: "estado", label: "Estado", type: "select", options: ["En cocina", "Lista", "Cobrada"] },
        { key: "total", label: "Total", type: "money" },
        {
          key: "items",
          label: "Platillos",
          type: "items",
          fields: [
            { key: "nombre", label: "Platillo", type: "text" },
            { key: "cantidad", label: "Cantidad", type: "number" },
          ],
        },
      ],
    },
  ],
};
