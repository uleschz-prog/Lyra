import { zipStore } from "@/lib/vega/zip-store";

export type ProjectKind = "app" | "sitio" | "agente";

export type ProjectFile = { path: string; content: string };

export type ProjectDraft = {
  title: string;
  kind: ProjectKind;
  summary: string;
  files: ProjectFile[];
  suggestions: string[];
};

type ServiceItem = { nombre: string; detalle: string; precio: string };
type Example = { persona: string; respuesta: string };

type Section =
  | { tipo: "portada"; titulo: string; texto: string; boton: string }
  | { tipo: "servicios"; titulo: string; items: ServiceItem[] }
  | { tipo: "agenda"; titulo: string; servicios: string[]; nota: string }
  | { tipo: "contacto"; titulo: string; campos: string[]; nota: string }
  | { tipo: "texto"; titulo: string; parrafos: string[] }
  | { tipo: "agente"; nombre: string; mision: string; reglas: string[]; ejemplos: Example[] };

const kinds = new Set<ProjectKind>(["app", "sitio", "agente"]);

function clip(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function block(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function jsonScript(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function slug(title: string) {
  const clean = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return clean || "lyra";
}

function colorOf(value: unknown, kind: ProjectKind) {
  const fallback = kind === "agente" ? "#1E1B4B" : kind === "sitio" ? "#6D28D9" : "#0F766E";
  const color = clip(value, 7);
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

function suggestionsFor(kind: ProjectKind, title: string, given: unknown) {
  const fromModel = Array.isArray(given)
    ? given.map((item) => clip(item, 140)).filter((item) => item.length >= 8 && !/[<>]/.test(item)).slice(0, 3)
    : [];
  if (fromModel.length) return fromModel;
  if (kind === "agente") {
    return [
      `Hazme una imagen de presentación para ${title}`,
      `Crea un video corto presentando a ${title}`,
      "Escríbeme el mensaje de WhatsApp con el que este agente saluda",
    ];
  }
  if (kind === "sitio") {
    return [
      `Hazme una imagen de portada para ${title}`,
      `Crea un video de 15 segundos para anunciar ${title}`,
      "Agrega una sección de preguntas frecuentes",
    ];
  }
  return [
    `Hazme el logo de ${title}`,
    `Crea un video corto para promocionar ${title}`,
    "Agrega un mensaje de WhatsApp para confirmar la cita",
  ];
}

function parseSections(value: unknown): Section[] | string {
  if (!Array.isArray(value) || value.length === 0) return "Falta al menos una sección.";
  const sections: Section[] = [];
  for (const item of value.slice(0, 6)) {
    const row = record(item);
    if (!row) continue;
    const tipo = clip(row.tipo, 20);
    if (tipo === "portada") {
      const titulo = clip(row.titulo, 80);
      const texto = clip(row.texto, 400);
      if (titulo && texto) sections.push({ tipo, titulo, texto, boton: clip(row.boton, 40) || "Empezar" });
    } else if (tipo === "servicios") {
      const items = Array.isArray(row.items)
        ? row.items
            .slice(0, 8)
            .flatMap((entry) => {
              const service = record(entry);
              const nombre = service ? clip(service.nombre, 60) : "";
              if (!service || !nombre) return [];
              return [{ nombre, detalle: clip(service.detalle, 160), precio: clip(service.precio, 24) }];
            })
        : [];
      if (items.length) sections.push({ tipo, titulo: clip(row.titulo, 80) || "Servicios", items });
    } else if (tipo === "agenda") {
      const servicios = Array.isArray(row.servicios)
        ? row.servicios.map((entry) => clip(entry, 60)).filter(Boolean).slice(0, 8)
        : [];
      sections.push({
        tipo,
        titulo: clip(row.titulo, 80) || "Agenda",
        servicios: servicios.length ? servicios : ["Consulta"],
        nota: clip(row.nota, 200),
      });
    } else if (tipo === "contacto") {
      const campos = Array.isArray(row.campos)
        ? row.campos.map((entry) => clip(entry, 40)).filter(Boolean).slice(0, 6)
        : [];
      sections.push({
        tipo,
        titulo: clip(row.titulo, 80) || "Contacto",
        campos: campos.length ? campos : ["Nombre", "Teléfono", "Mensaje"],
        nota: clip(row.nota, 200),
      });
    } else if (tipo === "texto") {
      const parrafos = Array.isArray(row.parrafos)
        ? row.parrafos.map((entry) => clip(entry, 400)).filter(Boolean).slice(0, 4)
        : [];
      const titulo = clip(row.titulo, 80);
      if (titulo && parrafos.length) sections.push({ tipo, titulo, parrafos });
    } else if (tipo === "agente") {
      const reglas = Array.isArray(row.reglas) ? row.reglas.map((entry) => clip(entry, 240)).filter(Boolean).slice(0, 8) : [];
      const ejemplos = Array.isArray(row.ejemplos)
        ? row.ejemplos.slice(0, 6).flatMap((entry) => {
            const example = record(entry);
            const persona = example ? clip(example.persona, 200) : "";
            const respuesta = example ? clip(example.respuesta, 400) : "";
            return example && persona && respuesta ? [{ persona, respuesta }] : [];
          })
        : [];
      const nombre = clip(row.nombre, 80);
      const mision = clip(row.mision, 400);
      if (nombre && mision && reglas.length) sections.push({ tipo, nombre, mision, reglas, ejemplos });
    }
  }
  if (!sections.length) return "Las secciones no traen contenido utilizable.";
  return sections;
}

function shell(input: { title: string; color: string; body: string; script?: string }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(input.title)}</title>
<style>
  :root { color-scheme: light; --ink:#14221f; --muted:#52615d; --line:#d7e4e0; --paper:#f4f7f6; --card:#ffffff; --brand:${input.color}; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; color: var(--ink); background: var(--paper); }
  header { padding: 28px 20px 8px; max-width: 880px; margin: 0 auto; }
  header p { margin: 6px 0 0; color: var(--muted); }
  main { max-width: 880px; margin: 0 auto; padding: 8px 20px 48px; display: grid; gap: 16px; }
  section { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 20px; }
  h1 { font-size: 2rem; line-height: 1.1; margin: 0; }
  h2 { margin: 0 0 12px; font-size: 1.25rem; }
  .hero { background: var(--brand); color: white; }
  .hero p { color: rgba(255,255,255,.9); }
  .hero button, button, .chip { border: 0; border-radius: 999px; padding: 10px 16px; font: inherit; cursor: pointer; }
  .hero button, button.primary { background: #14221f; color: white; }
  .grid { display: grid; gap: 10px; }
  @media (min-width: 700px) { .grid.cards { grid-template-columns: 1fr 1fr; } }
  article { border: 1px solid var(--line); border-radius: 14px; padding: 14px; }
  article strong { display: block; }
  article span { color: var(--muted); font-size: .92rem; }
  label { display: grid; gap: 6px; font-size: .92rem; }
  input, select, textarea { width: 100%; border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; font: inherit; }
  textarea { min-height: 90px; resize: vertical; }
  ul { margin: 0; padding-left: 18px; display: grid; gap: 8px; }
  li.empty { list-style: none; margin-left: -18px; color: var(--muted); }
  .row { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
  button.ghost { background: #e7f3f0; color: var(--ink); }
  .chat { display: grid; gap: 8px; }
  .bubble { border-radius: 14px; padding: 10px 12px; }
  .person { background: #e7f3f0; }
  .agent { background: #14221f; color: white; }
  form { display: grid; gap: 10px; }
</style>
</head>
<body>
<header><p>Hecho con Vega · LYRA</p><h1>${esc(input.title)}</h1></header>
<main>
${input.body}
</main>
${input.script ? `<script>${input.script}</script>` : ""}
</body>
</html>
`;
}

function render(title: string, color: string, sections: Section[]) {
  const parts: string[] = [];
  const scripts: string[] = [];
  const storageKey = `lyra-${slug(title)}`;

  for (const section of sections) {
    if (section.tipo === "portada") {
      parts.push(`<section class="hero"><h2>${esc(section.titulo)}</h2><p>${esc(section.texto)}</p><p><button type="button" onclick="document.getElementById('accion')?.scrollIntoView({behavior:'smooth'})">${esc(section.boton)}</button></p></section>`);
    } else if (section.tipo === "servicios") {
      parts.push(
        `<section><h2>${esc(section.titulo)}</h2><div class="grid cards">${section.items
          .map(
            (item) =>
              `<article><strong>${esc(item.nombre)}</strong><span>${esc(item.detalle)}</span>${item.precio ? `<p>${esc(item.precio)}</p>` : ""}</article>`,
          )
          .join("")}</div></section>`,
      );
    } else if (section.tipo === "texto") {
      parts.push(`<section><h2>${esc(section.titulo)}</h2>${section.parrafos.map((paragraph) => `<p>${esc(paragraph)}</p>`).join("")}</section>`);
    } else if (section.tipo === "agenda") {
      const options = section.servicios.map((service) => `<option>${esc(service)}</option>`).join("");
      parts.push(`<section id="accion"><h2>${esc(section.titulo)}</h2>${section.nota ? `<p>${esc(section.nota)}</p>` : ""}
<form id="agenda">
<label>Nombre<input name="nombre" required autocomplete="name" /></label>
<label>Teléfono<input name="telefono" required autocomplete="tel" /></label>
<label>Servicio<select name="servicio">${options}</select></label>
<label>Fecha<input name="fecha" type="date" required /></label>
<label>Hora<input name="hora" type="time" required /></label>
<button class="primary" type="submit">Guardar cita</button>
</form>
<h2>Citas guardadas</h2>
<ul id="citas"><li class="empty">Todavía no hay citas.</li></ul>
</section>`);
      scripts.push(`
const clave = ${jsonScript(storageKey)};
const lista = document.getElementById("citas");
const form = document.getElementById("agenda");
let memoria = [];
function leer() {
  try {
    const raw = localStorage.getItem(clave);
    if (raw) return JSON.parse(raw);
  } catch {}
  return memoria;
}
function guardar(citas) {
  memoria = citas;
  try { localStorage.setItem(clave, JSON.stringify(citas)); } catch {}
}
function pintar() {
  const citas = leer();
  lista.innerHTML = citas.length ? "" : '<li class="empty">Todavía no hay citas.</li>';
  citas.forEach((cita, index) => {
    const item = document.createElement("li");
    item.className = "row";
    const text = document.createElement("span");
    text.textContent = cita.nombre + " · " + cita.servicio + " · " + cita.fecha + " " + cita.hora + " · " + cita.telefono;
    const button = document.createElement("button");
    button.className = "ghost";
    button.type = "button";
    button.textContent = "Cancelar";
    button.addEventListener("click", () => {
      const next = leer();
      next.splice(index, 1);
      guardar(next);
      pintar();
    });
    item.append(text, button);
    lista.append(item);
  });
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const citas = leer();
  citas.push({
    nombre: String(data.get("nombre") || ""),
    telefono: String(data.get("telefono") || ""),
    servicio: String(data.get("servicio") || ""),
    fecha: String(data.get("fecha") || ""),
    hora: String(data.get("hora") || "")
  });
  guardar(citas);
  form.reset();
  pintar();
});
pintar();
`);
    } else if (section.tipo === "contacto") {
      const fields = section.campos
        .map((field) => {
          const control = field.toLowerCase().includes("mensaje")
            ? `<textarea name="${esc(field)}" required></textarea>`
            : `<input name="${esc(field)}" required />`;
          return `<label>${esc(field)}${control}</label>`;
        })
        .join("");
      parts.push(`<section id="accion"><h2>${esc(section.titulo)}</h2>${section.nota ? `<p>${esc(section.nota)}</p>` : ""}
<form id="contacto">${fields}<button class="primary" type="submit">Enviar</button></form>
<ul id="mensajes"><li class="empty">Todavía no hay mensajes.</li></ul></section>`);
      scripts.push(`
const claveContacto = ${jsonScript(`${storageKey}-contacto`)};
const formContacto = document.getElementById("contacto");
const mensajes = document.getElementById("mensajes");
let memoriaMensajes = [];
function leerMensajes() {
  try {
    const raw = localStorage.getItem(claveContacto);
    if (raw) return JSON.parse(raw);
  } catch {}
  return memoriaMensajes;
}
function guardarMensajes(items) {
  memoriaMensajes = items;
  try { localStorage.setItem(claveContacto, JSON.stringify(items)); } catch {}
}
function pintarMensajes() {
  const items = leerMensajes();
  mensajes.innerHTML = items.length ? "" : '<li class="empty">Todavía no hay mensajes.</li>';
  items.forEach((item) => {
    const row = document.createElement("li");
    row.textContent = item;
    mensajes.append(row);
  });
}
formContacto.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(formContacto);
  const line = [...data.entries()].map(([key, value]) => key + ": " + value).join(" · ");
  const items = leerMensajes();
  items.push(line);
  guardarMensajes(items);
  formContacto.reset();
  pintarMensajes();
});
pintarMensajes();
`);
    } else {
      parts.push(`<section><h2>${esc(section.nombre)}</h2><p>${esc(section.mision)}</p><h2>Reglas</h2><ul>${section.reglas
        .map((rule) => `<li>${esc(rule)}</li>`)
        .join("")}</ul></section>
<section id="accion"><h2>Prueba al agente</h2><div class="chat" id="chat"></div>
<form id="sim"><label>Mensaje<textarea name="mensaje" required></textarea></label><button class="primary" type="submit">Enviar</button></form></section>`);
      scripts.push(`
const ejemplos = ${jsonScript(section.ejemplos)};
const reglas = ${jsonScript(section.reglas)};
const chat = document.getElementById("chat");
function burbuja(texto, clase) {
  const node = document.createElement("p");
  node.className = "bubble " + clase;
  node.textContent = texto;
  chat.append(node);
}
function responder(texto) {
  const words = texto.toLowerCase().split(/[^a-záéíóúñ0-9]+/i).filter((word) => word.length > 3);
  let best = null;
  let score = 0;
  for (const example of ejemplos) {
    const hay = example.persona.toLowerCase();
    const points = words.filter((word) => hay.includes(word)).length;
    if (points > score) { score = points; best = example; }
  }
  if (best && score > 0) return best.respuesta;
  return reglas[0] ? "Puedo ayudarte. " + reglas[0] : "Cuéntame un poco más.";
}
burbuja(${jsonScript(section.mision)}, "agent");
document.getElementById("sim").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const text = String(data.get("mensaje") || "");
  burbuja(text, "person");
  burbuja(responder(text), "agent");
  event.currentTarget.reset();
});
`);
    }
  }

  return shell({ title, color, body: parts.join("\n"), script: scripts.join("\n") });
}

function readme(project: { title: string; kind: ProjectKind; summary: string }) {
  const kindLabel = project.kind === "app" ? "app" : project.kind === "sitio" ? "sitio" : "agente";
  return `${project.title}

${project.summary}

Cómo usarlo
1. Abre index.html en Chrome, Edge, Safari o Firefox.
2. Lo que la persona escribe (citas, mensajes o la prueba del agente) se guarda en ese navegador.
3. Para publicarlo, sube esta carpeta a un hosting de archivos estáticos.

Este ${kindLabel} no trae base de datos ni cobros en un servidor. Si más adelante quieres WhatsApp, correo o agenda de Google, pídeselo a Vega dentro de LYRA.
`;
}

function agentFile(sections: Section[]) {
  const agent = sections.find((section) => section.tipo === "agente");
  if (!agent || agent.tipo !== "agente") return null;
  return {
    path: "agente.json",
    content: `${JSON.stringify(
      {
        nombre: agent.nombre,
        mision: agent.mision,
        reglas: agent.reglas,
        ejemplos: agent.ejemplos,
        prompt: `Eres ${agent.nombre}. ${agent.mision} Reglas: ${agent.reglas.join(" ")}`,
      },
      null,
      2,
    )}\n`,
  };
}

export function buildProject(raw: unknown): { ok: true; project: ProjectDraft } | { ok: false; error: string } {
  const input = record(raw);
  if (!input) return { ok: false, error: "El proyecto tiene que ser un objeto." };
  const kind = clip(input.tipo, 20);
  if (!kinds.has(kind as ProjectKind)) return { ok: false, error: "El tipo debe ser app, sitio o agente." };
  const projectKind = kind as ProjectKind;
  const title = clip(input.titulo, 80);
  const summary = clip(input.resumen, 280);
  if (title.length < 3 || summary.length < 8) return { ok: false, error: "Faltan el título o el resumen." };
  const parsed = parseSections(input.secciones);
  if (typeof parsed === "string") return { ok: false, error: parsed };
  if (projectKind === "agente" && !parsed.some((section) => section.tipo === "agente")) {
    return { ok: false, error: "Un agente necesita una sección de tipo agente, con misión, reglas y ejemplos." };
  }
  if (projectKind === "app" && !parsed.some((section) => section.tipo === "agenda" || section.tipo === "contacto")) {
    return { ok: false, error: "Una app necesita una sección agenda o contacto para que la persona pueda usarla." };
  }

  const html = render(title, colorOf(input.color, projectKind), parsed);
  const files: ProjectFile[] = [
    { path: "index.html", content: html },
    { path: "LEEME.txt", content: readme({ title, kind: projectKind, summary }) },
  ];
  const agent = agentFile(parsed);
  if (agent) files.push(agent);

  return {
    ok: true,
    project: {
      title,
      kind: projectKind,
      summary,
      files,
      suggestions: suggestionsFor(projectKind, title, input.sugerencias),
    },
  };
}

export function projectHtml(project: ProjectDraft) {
  return project.files.find((file) => file.path === "index.html")?.content ?? "";
}

export function projectZip(project: Pick<ProjectDraft, "files">) {
  return zipStore(project.files);
}

export function buildStoryboard(title: string, scenes: string[]) {
  const slides = scenes
    .map(
      (scene, index) =>
        `<section style="animation-delay:${index * 3}s"><p>${esc(String(index + 1))}</p><h2>${esc(scene)}</h2></section>`,
    )
    .join("");
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #1E1B4B; color: white; font-family: "Segoe UI", system-ui, sans-serif; }
  h1 { position: absolute; top: 28px; left: 28px; right: 28px; margin: 0; font-size: 1.1rem; opacity: .8; }
  section { position: absolute; inset: 18vh 10vw auto; opacity: 0; animation: slide 9s infinite; }
  section p { letter-spacing: .2em; opacity: .7; }
  section h2 { font-size: clamp(1.6rem, 4vw, 3rem); line-height: 1.15; margin: 0; }
  @keyframes slide { 0% { opacity: 0; } 8% { opacity: 1; } 30% { opacity: 1; } 38% { opacity: 0; } 100% { opacity: 0; } }
</style>
</head>
<body>
<h1>${esc(title)}</h1>
${slides}
</body>
</html>`;
}
