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
    expect(html).toContain("Solicitar cita");
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
    expect(Buffer.from(zip).includes(Buffer.from("Solicitar cita"))).toBe(true);
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(scripts).toHaveLength(1);
    expect(() => new Function(scripts[0][1])).not.toThrow();
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
          reglas: ["Pide nombre, servicio y horario.", "No confirmes citas sin disponibilidad real.", "Deriva urgencias a una persona."],
          ejemplos: [
            { persona: "Quiero una cita", respuesta: "Claro, ¿qué servicio necesitas y qué horario prefieres?" },
            { persona: "¿Qué servicios tienen?", respuesta: "Tenemos consulta general y limpieza dental." },
            { persona: "Tengo una urgencia", respuesta: "Te ayudaré a contactar a una persona del equipo." },
          ],
        },
      ],
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const html = projectHtml(built.project);
    expect(html).toContain("Recepción &lt;Luna&gt;");
    expect(html).not.toContain("Recepción <Luna>");
    expect(html).toContain("Una conversación de muestra");
    expect(html).toContain("Para conversaciones con IA en vivo hace falta conectar un modelo");
    const spec = built.project.files.find((file) => file.path === "agente.json")?.content ?? "";
    expect(spec).toContain("Pide nombre, servicio y horario.");
    expect(spec).toContain("Identidad: Eres Luna");
    expect(built.project.suggestions).toHaveLength(3);
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(() => new Function(scripts[0][1])).not.toThrow();
  });

  it("crea una herramienta de registros local y valida sitios con CTA y contacto", () => {
    const app = buildProject({
      titulo: "Seguimiento de prospectos",
      tipo: "app",
      resumen: "Registro y seguimiento de prospectos comerciales.",
      secciones: [{
        tipo: "herramienta",
        titulo: "Prospectos",
        etiqueta: "prospecto",
        campos: ["Nombre", "Correo", "Próximo paso"],
      }],
    });
    expect(app.ok).toBe(true);
    if (app.ok) {
      const html = projectHtml(app.project);
      expect(html).toContain("Guardar prospecto");
      expect(html).toContain("Eliminar");
      expect(html).toContain("localStorage");
      expect(() => new Function([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1])).not.toThrow();
    }

    expect(buildProject({
      titulo: "Estudio Norte",
      tipo: "sitio",
      resumen: "Diseño de identidad visual para marcas.",
      secciones: [{ tipo: "portada", titulo: "Marcas con intención", texto: "Diseño estratégico.", boton: "Hablemos" }],
    })).toMatchObject({ ok: false });

    const site = buildProject({
      titulo: "Estudio Norte",
      tipo: "sitio",
      resumen: "Diseño estratégico de marca y sitios web.",
      secciones: [
        { tipo: "portada", titulo: "Marcas con intención", texto: "Una identidad que expresa lo que hace única a tu marca.", boton: "Hablemos" },
        { tipo: "servicios", titulo: "Diseño para crecer", items: [{ nombre: "Identidad visual", detalle: "Una dirección visual clara y coherente." }] },
        { tipo: "pasos", titulo: "Del brief al lanzamiento", items: [{ titulo: "01 · Exploramos", texto: "Alineamos tus metas y tu audiencia." }] },
        { tipo: "preguntas", titulo: "Dudas frecuentes", items: [{ titulo: "¿Cómo empezamos?", texto: "Cuéntanos qué estás construyendo." }] },
        { tipo: "contacto", titulo: "Cuéntanos tu idea", campos: ["Nombre", "Correo", "Mensaje"] },
      ],
    });
    expect(site.ok).toBe(true);
    if (site.ok) {
      const html = projectHtml(site.project);
      expect(html).toContain("Del brief al lanzamiento");
      expect(html).toContain("Dudas frecuentes");
      expect(html).toContain('href="#accion"');
      expect(html).toContain("Este prototipo no envía correos");
      expect(() => new Function([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1])).not.toThrow();
    }
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
