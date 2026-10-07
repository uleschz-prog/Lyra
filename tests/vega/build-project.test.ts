import { describe, expect, it } from "vitest";

import { buildProject, buildStoryboard, projectHtml, projectZip } from "@/lib/vega/build-project";

const clinic = {
  titulo: "Clínica Luna",
  tipo: "app",
  resumen: "Agenda de citas para la recepción de la clínica.",
  color: "no-es-color",
  secciones: [
    { tipo: "portada", titulo: "Agenda tu cita", texto: "Elige servicio, fecha y hora.", boton: "Agendar" },
    {
      tipo: "servicios",
      titulo: "Servicios",
      items: [{ nombre: "Consulta", detalle: "30 minutos", precio: "$500" }],
    },
    { tipo: "agenda", titulo: "Nueva cita", servicios: ["Consulta", "Limpieza"], nota: "Te confirmamos por teléfono." },
  ],
  sugerencias: ["<script>alert(1)</script> no", "Hazme el logo de la clínica"],
};

describe("proyectos de Vega", () => {
  it("arma una app de citas con vista previa y código descargable", () => {
    const built = buildProject(clinic);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const html = projectHtml(built.project);
    expect(html).toContain("Clínica Luna");
    expect(html).toContain('name="nombre"');
    expect(html).toContain("Guardar cita");
    expect(html).toContain("localStorage");
    expect(html).toContain("Limpieza");
    expect(html).not.toContain("<script>alert");
    expect(built.project.suggestions).toEqual(["Hazme el logo de la clínica"]);
    expect(built.project.files.map((file) => file.path)).toEqual(["index.html", "LEEME.txt"]);
    const zip = projectZip(built.project);
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    expect(Buffer.from(zip).includes(Buffer.from("index.html"))).toBe(true);
    expect(Buffer.from(zip).includes(Buffer.from("LEEME.txt"))).toBe(true);
    expect(Buffer.from(zip).includes(Buffer.from("Guardar cita"))).toBe(true);
  });

  it("escapa el título y entrega el guion de un agente", () => {
    const built = buildProject({
      titulo: "Recepción <Luna>",
      tipo: "agente",
      resumen: "Confirma citas y responde dudas de los pacientes.",
      secciones: [
        {
          tipo: "agente",
          nombre: "Luna",
          mision: "Agendar citas con amabilidad.",
          reglas: ["Pide nombre, servicio y hora."],
          ejemplos: [{ persona: "Quiero una cita mañana", respuesta: "Claro, ¿a qué hora te queda bien?" }],
        },
      ],
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const html = projectHtml(built.project);
    expect(html).toContain("Recepción &lt;Luna&gt;");
    expect(html).not.toContain("Recepción <Luna>");
    expect(html).toContain("Prueba al agente");
    const spec = built.project.files.find((file) => file.path === "agente.json")?.content ?? "";
    expect(spec).toContain("Pide nombre, servicio y hora.");
    expect(built.project.suggestions).toHaveLength(3);
  });

  it("rechaza una app sin forma de usarla", () => {
    const built = buildProject({
      titulo: "Folleto",
      tipo: "app",
      resumen: "Solo texto, sin agenda ni contacto.",
      secciones: [{ tipo: "texto", titulo: "Hola", parrafos: ["Un párrafo."] }],
    });
    expect(built.ok).toBe(false);
  });

  it("arma la secuencia de un video", () => {
    const html = buildStoryboard("Anuncio", ["Abre tu agenda.", "Elige la hora."]);
    expect(html).toContain("Abre tu agenda.");
    expect(html).toContain("Elige la hora.");
  });
});
