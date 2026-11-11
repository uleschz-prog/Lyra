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
type ContentItem = { titulo: string; texto: string };

type Section =
  | { tipo: "portada"; titulo: string; texto: string; boton: string }
  | { tipo: "servicios"; titulo: string; items: ServiceItem[] }
  | { tipo: "pasos" | "preguntas" | "testimonios" | "precios"; titulo: string; items: ContentItem[] }
  | { tipo: "agenda"; titulo: string; servicios: string[]; nota: string }
  | { tipo: "herramienta"; titulo: string; etiqueta: string; campos: string[]; nota: string }
  | { tipo: "contacto"; titulo: string; campos: string[]; nota: string }
  | { tipo: "texto"; titulo: string; parrafos: string[] }
  | { tipo: "agente"; nombre: string; mision: string; reglas: string[]; ejemplos: Example[] };

const kinds = new Set<ProjectKind>(["app", "sitio", "agente"]);

function clip(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
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
    "Agrega un panel de seguimiento para los registros",
  ];
}

function parseSections(value: unknown): Section[] | string {
  if (!Array.isArray(value) || value.length === 0) return "Falta al menos una sección.";
  const sections: Section[] = [];
  for (const item of value.slice(0, 12)) {
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
    } else if (tipo === "pasos" || tipo === "preguntas" || tipo === "testimonios" || tipo === "precios") {
      const items = Array.isArray(row.items)
        ? row.items.slice(0, 8).flatMap((entry) => {
            const content = record(entry);
            const titulo = content ? clip(content.titulo, 100) : "";
            const texto = content ? clip(content.texto, 400) : "";
            return content && titulo && texto ? [{ titulo, texto }] : [];
          })
        : [];
      if (items.length) sections.push({ tipo, titulo: clip(row.titulo, 80) || "Detalles", items });
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
    } else if (tipo === "herramienta") {
      const campos = Array.isArray(row.campos)
        ? row.campos.map((entry) => clip(entry, 40)).filter(Boolean).slice(0, 6)
        : [];
      if (campos.length) {
        sections.push({
          tipo,
          titulo: clip(row.titulo, 80) || "Registros",
          etiqueta: clip(row.etiqueta, 32) || "registro",
          campos,
          nota: clip(row.nota, 200),
        });
      }
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
      if (nombre && mision && reglas.length >= 3 && ejemplos.length >= 3) sections.push({ tipo, nombre, mision, reglas, ejemplos });
    }
  }
  if (!sections.length) return "Las secciones no traen contenido utilizable.";
  return sections;
}

function shell(input: { title: string; color: string; body: string; script?: string; links: { id: string; label: string }[]; storesLocally: boolean }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="${input.color}" />
<title>${esc(input.title)}</title>
<style>
  :root{color-scheme:light;--ink:#17211f;--muted:#687572;--line:#e4e9e7;--paper:#f6f7f5;--card:#fff;--brand:${input.color};--tint:color-mix(in srgb,var(--brand) 9%,white);--shadow:0 20px 60px rgba(30,45,40,.08)}
  *{box-sizing:border-box}
  html{scroll-behavior:smooth;scroll-padding-top:96px}
  body{margin:0;color:var(--ink);background:var(--paper);font:16px/1.65 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
  a{color:inherit;text-decoration:none}
  .topbar{position:sticky;top:0;z-index:5;border-bottom:1px solid rgba(228,233,231,.8);background:rgba(255,255,255,.88);backdrop-filter:blur(16px)}
  .topbar-inner{width:min(1120px,100%);min-height:72px;margin:auto;padding:12px 28px;display:flex;align-items:center;justify-content:space-between;gap:24px}
  .brand{display:flex;align-items:center;gap:10px;font-size:.95rem;font-weight:750;letter-spacing:-.02em}
  .brand-mark{display:grid;width:34px;height:34px;place-items:center;border-radius:12px;color:#fff;background:var(--brand);font-size:.86rem}
  nav{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}
  nav::-webkit-scrollbar{display:none}
  nav a{white-space:nowrap;border-radius:999px;padding:8px 12px;color:var(--muted);font-size:.81rem;font-weight:600;transition:background .2s,color .2s}
  nav a:hover,nav a:focus-visible{color:var(--brand);background:var(--tint)}
  main{width:min(1120px,100%);margin:0 auto;padding:52px 28px 88px;display:grid;gap:22px}
  section{min-width:0;padding:clamp(24px,5vw,46px);border:1px solid var(--line);border-radius:26px;background:var(--card);box-shadow:var(--shadow);scroll-margin-top:94px}
  .hero{position:relative;overflow:hidden;isolation:isolate;min-height:390px;padding:clamp(34px,7vw,76px);display:flex;flex-direction:column;align-items:flex-start;justify-content:center;color:#fff;border:0;background:linear-gradient(125deg,color-mix(in srgb,var(--brand) 88%,#0d1110),var(--brand) 58%,color-mix(in srgb,var(--brand) 70%,#dbd5ff))}
  .hero:after{position:absolute;z-index:-1;right:-110px;bottom:-260px;width:560px;height:560px;border:1px solid rgba(255,255,255,.22);border-radius:50%;box-shadow:0 0 0 42px rgba(255,255,255,.06),0 0 0 90px rgba(255,255,255,.04);content:""}
  .eyebrow{margin:0 0 12px;color:var(--brand);font-size:.72rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
  .hero .eyebrow{color:rgba(255,255,255,.72)}
  h1,h2,h3,p{margin-top:0}
  h1{max-width:780px;margin-bottom:14px;font-size:clamp(2.4rem,7vw,5rem);line-height:1.02;letter-spacing:-.06em}
  h2{margin-bottom:10px;font-size:clamp(1.55rem,3vw,2.25rem);line-height:1.12;letter-spacing:-.045em}
  h3{margin-bottom:7px;font-size:1.05rem;line-height:1.3;letter-spacing:-.02em}
  .hero-copy{max-width:650px;margin:0;color:rgba(255,255,255,.83);font-size:clamp(1rem,2vw,1.15rem)}
  .hero-actions{display:flex;align-items:center;gap:14px;margin-top:27px}
  .hero-link,.button{display:inline-flex;min-height:46px;align-items:center;justify-content:center;gap:8px;border:0;border-radius:999px;padding:11px 20px;background:var(--brand);color:white;font:inherit;font-size:.9rem;font-weight:700;cursor:pointer;transition:transform .2s,filter .2s}
  .hero-link{background:#fff;color:#17211f}
  .hero-link:hover,.button:hover{transform:translateY(-2px);filter:brightness(.96)}
  .subtle{color:var(--muted)}
  .section-head{max-width:700px;margin-bottom:24px}
  .section-head p:last-child{margin-bottom:0}
  .grid{display:grid;gap:14px}
  .cards{grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))}
  article{min-width:0;padding:20px;border:1px solid var(--line);border-radius:18px;background:linear-gradient(145deg,#fff,#fbfcfb)}
  article p:last-child{margin-bottom:0}
  .card-index{display:grid;width:32px;height:32px;margin-bottom:18px;place-items:center;border-radius:10px;color:var(--brand);background:var(--tint);font-size:.78rem;font-weight:800}
  .price{margin-top:14px;color:var(--brand);font-size:1.05rem;font-weight:750}
  .faq-card{border-radius:16px}
  .notice{display:flex;gap:12px;align-items:flex-start;margin:0 0 22px;padding:14px 16px;border:1px solid color-mix(in srgb,var(--brand) 22%,white);border-radius:14px;background:var(--tint);color:var(--ink);font-size:.86rem}
  .notice-mark{flex:none;color:var(--brand);font-weight:900}
  label{display:grid;gap:7px;color:var(--ink);font-size:.86rem;font-weight:650}
  input,select,textarea{width:100%;min-height:46px;border:1px solid #dce3e0;border-radius:12px;padding:11px 13px;background:#fff;color:var(--ink);font:inherit;font-size:.95rem}
  textarea{min-height:100px;resize:vertical}
  input:focus,select:focus,textarea:focus{border-color:var(--brand);outline:3px solid var(--tint)}
  form{display:grid;gap:14px}
  .form-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))}
  .form-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
  .button.secondary{border:1px solid var(--line);background:#fff;color:var(--ink)}
  .list{display:grid;gap:10px;margin:20px 0 0}
  .list-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:15px 16px;border:1px solid var(--line);border-radius:14px;background:#fff}
  .list-row p{margin:4px 0 0;color:var(--muted);font-size:.88rem;overflow-wrap:anywhere}
  .empty{padding:18px;border:1px dashed #cbd5d1;border-radius:14px;color:var(--muted);text-align:center}
  .text-link{padding:7px 10px;border:0;border-radius:8px;background:var(--tint);color:var(--brand);font:inherit;font-size:.82rem;font-weight:700;cursor:pointer}
  .chat{display:grid;gap:12px;max-height:360px;overflow-y:auto;margin-bottom:16px}
  .bubble{max-width:min(86%,680px);margin:0;padding:13px 16px;border-radius:18px;background:#f0f3f2;overflow-wrap:anywhere}
  .bubble.person{justify-self:end;border-bottom-right-radius:5px;color:white;background:var(--brand)}
  .bubble.agent{justify-self:start;border-bottom-left-radius:5px}
  .example-prompts{display:flex;gap:8px;overflow-x:auto;padding:2px 0 14px}
  .example-prompt{flex:none;border:1px solid var(--line);border-radius:999px;padding:8px 12px;background:#fff;color:var(--muted);font:inherit;font-size:.82rem;cursor:pointer}
  .example-prompt:hover{border-color:var(--brand);color:var(--brand)}
  footer{width:min(1120px,100%);margin:0 auto;padding:0 28px 34px;color:var(--muted);font-size:.78rem}
  @media(max-width:680px){.topbar-inner{min-height:unset;display:block;padding:10px 16px}.brand{margin-bottom:8px}nav{margin:0 -4px}nav a{padding:7px 10px;font-size:.76rem}main{padding:20px 14px 48px;gap:14px}section{padding:24px 20px;border-radius:20px}.hero{min-height:360px;padding:30px 24px}.hero-actions{align-items:flex-start;flex-direction:column}footer{padding:0 18px 26px}.list-row{gap:10px}}
  @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important}}
</style>
</head>
<body>
<header class="topbar"><div class="topbar-inner">
<a class="brand" href="#inicio"><span class="brand-mark" aria-hidden="true">✦</span>${esc(input.title)}</a>
<nav aria-label="Navegación principal">${input.links.map((link) => `<a href="#${link.id}">${esc(link.label)}</a>`).join("")}</nav>
</div></header>
<main>
${input.body}
</main>
<footer>Prototipo creado con Vega · LYRA. ${input.storesLocally ? "Los datos se guardan sólo en este navegador; no se envían a un servidor." : input.script ? "La demostración es local y no conecta con un modelo de IA." : "Diseñado para explicar tu propuesta con claridad."}</footer>
${input.script ? `<script>${input.script}</script>` : ""}
</body>
</html>
`;
}

function render(title: string, color: string, sections: Section[]) {
  const parts: string[] = [];
  const scripts: string[] = [];
  const links: { id: string; label: string }[] = [];
  const storageKey = `lyra-${slug(title)}`;
  let actionAssigned = false;
  const ctaTarget = sections.some((section) => ["agenda", "herramienta", "contacto", "agente"].includes(section.tipo))
    ? "#accion"
    : sections.length > 1
      ? "#seccion-2"
      : "#inicio";

  for (const [index, section] of sections.entries()) {
    const id = section.tipo === "portada" ? "inicio" : `seccion-${index + 1}`;
    const label = section.tipo === "portada" ? "" : section.tipo === "texto" ? section.titulo : section.tipo === "agente" ? section.nombre : section.titulo;
    if (label) links.push({ id, label: label.slice(0, 24) });
    const actionId = ["agenda", "herramienta", "contacto", "agente"].includes(section.tipo) && !actionAssigned ? "accion" : id;
    if (actionId === "accion") actionAssigned = true;
    const heading = (eyebrow: string, titleText: string, intro = "") =>
      `<div class="section-head"><p class="eyebrow">${esc(eyebrow)}</p><h2>${esc(titleText)}</h2>${intro ? `<p class="subtle">${esc(intro)}</p>` : ""}</div>`;

    if (section.tipo === "portada") {
      parts.push(`<section class="hero" id="${id}"><p class="eyebrow">Una experiencia hecha para ti</p><h1>${esc(section.titulo)}</h1><p class="hero-copy">${esc(section.texto)}</p><div class="hero-actions"><a class="hero-link" href="${ctaTarget}">${esc(section.boton)} <span aria-hidden="true">→</span></a><span class="subtle" style="color:rgba(255,255,255,.7)">Descubre una mejor forma de hacerlo</span></div></section>`);
    } else if (section.tipo === "servicios") {
      parts.push(
        `<section id="${id}">${heading("Lo que hacemos", section.titulo)}<div class="grid cards">${section.items
          .map(
            (item) =>
              `<article><span class="card-index" aria-hidden="true">✦</span><h3>${esc(item.nombre)}</h3><p class="subtle">${esc(item.detalle)}</p>${item.precio ? `<p class="price">${esc(item.precio)}</p>` : ""}</article>`,
          )
          .join("")}</div></section>`,
      );
    } else if (section.tipo === "pasos" || section.tipo === "preguntas" || section.tipo === "testimonios" || section.tipo === "precios") {
      const eyebrow = { pasos: "Así funciona", preguntas: "Respuestas claras", testimonios: "Experiencias", precios: "Opciones" }[section.tipo];
      parts.push(`<section id="${id}">${heading(eyebrow, section.titulo)}<div class="grid cards">${section.items.map((item, itemIndex) => {
        if (section.tipo === "preguntas") return `<article class="faq-card"><h3>${esc(item.titulo)}</h3><p class="subtle">${esc(item.texto)}</p></article>`;
        if (section.tipo === "testimonios") return `<article><p>“${esc(item.texto)}”</p><h3>${esc(item.titulo)}</h3></article>`;
        return `<article><span class="card-index" aria-hidden="true">${String(itemIndex + 1).padStart(2, "0")}</span><h3>${esc(item.titulo)}</h3><p class="subtle">${esc(item.texto)}</p></article>`;
      }).join("")}</div></section>`);
    } else if (section.tipo === "texto") {
      parts.push(`<section id="${id}">${heading("Nuestra historia", section.titulo)}${section.parrafos.map((paragraph) => `<p class="subtle">${esc(paragraph)}</p>`).join("")}</section>`);
    } else if (section.tipo === "agenda") {
      const options = section.servicios.map((service) => `<option>${esc(service)}</option>`).join("");
      parts.push(`<section id="${id}">${actionId === "accion" ? '<span id="accion"></span>' : ""}${heading("Reserva", section.titulo, section.nota)}
<form id="agenda-${index}" class="form-grid">
<label>Nombre<input name="nombre" required autocomplete="name" /></label>
<label>Teléfono<input name="telefono" required autocomplete="tel" /></label>
<label>Servicio<select name="servicio">${options}</select></label>
<label>Fecha<input name="fecha" type="date" required /></label>
<label>Hora<input name="hora" type="time" required /></label>
<div class="form-actions"><button class="button" type="submit">Solicitar cita <span aria-hidden="true">→</span></button><span class="subtle">Tu solicitud quedará guardada en este navegador.</span></div>
</form>
<div class="list" id="citas-${index}" aria-live="polite"></div>
</section>`);
      scripts.push(`
const clave = ${jsonScript(storageKey)};
const lista = document.getElementById(${jsonScript(`citas-${index}`)});
const form = document.getElementById(${jsonScript(`agenda-${index}`)});
let memoria = [];
function leer() {
  try {
    const raw = localStorage.getItem(clave);
    if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed; }
  } catch {}
  return memoria;
}
function guardar(citas) {
  memoria = citas;
  try { localStorage.setItem(clave, JSON.stringify(citas)); } catch {}
}
function pintar() {
  const citas = leer();
  lista.replaceChildren();
  if (!citas.length) { const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "Todavía no hay citas. Cuando alguien envíe una solicitud, aparecerá aquí."; lista.append(empty); return; }
  citas.forEach((cita, index) => {
    const item = document.createElement("article");
    item.className = "list-row";
    const text = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = cita.nombre + " · " + cita.servicio;
    const detail = document.createElement("p");
    detail.textContent = cita.fecha + " a las " + cita.hora + " · " + cita.telefono;
    text.append(name, detail);
    const button = document.createElement("button");
    button.className = "text-link";
    button.type = "button";
    button.textContent = "Eliminar";
    button.setAttribute("aria-label", "Eliminar cita de " + cita.nombre);
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
form.addEventListener("submit", (event) => {
event.preventDefault();
const submit = form.querySelector('button[type="submit"]');
if (submit) { submit.textContent = "Solicitud guardada"; setTimeout(() => { submit.innerHTML = 'Solicitar cita <span aria-hidden="true">→</span>'; }, 1800); }
});
pintar();
`);
  } else if (section.tipo === "herramienta") {
    const fields = section.campos.map((field, fieldIndex) => {
      const type = /correo|email/i.test(field) ? "email" : /tel[eé]fono|celular/i.test(field) ? "tel" : /fecha/i.test(field) ? "date" : "text";
      const autocomplete = /nombre/i.test(field) ? ' autocomplete="name"' : type === "tel" ? ' autocomplete="tel"' : type === "email" ? ' autocomplete="email"' : "";
      return `<label>${esc(field)}<input name="campo${fieldIndex}" type="${type}"${autocomplete} required /></label>`;
    }).join("");
    const key = `${storageKey}-herramienta-${index}`;
    parts.push(`<section id="${id}">${actionId === "accion" ? '<span id="accion"></span>' : ""}${heading("Espacio de trabajo", section.titulo, section.nota)}
<form id="registros-${index}" class="form-grid">${fields}<div class="form-actions"><button class="button" type="submit">Guardar ${esc(section.etiqueta)}</button><span class="subtle">Se guarda sólo en este navegador.</span></div></form>
<div class="list" id="lista-${index}" aria-live="polite"></div></section>`);
    scripts.push(`
const claveRegistros = ${jsonScript(key)};
const formularioRegistros = document.getElementById(${jsonScript(`registros-${index}`)});
const listaRegistros = document.getElementById(${jsonScript(`lista-${index}`)});
let memoriaRegistros = [];
function leerRegistros() { try { const raw = localStorage.getItem(claveRegistros); if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed; } } catch {} return memoriaRegistros; }
function guardarRegistros(items) { memoriaRegistros = items; try { localStorage.setItem(claveRegistros, JSON.stringify(items)); } catch {} }
function pintarRegistros() {
const items = leerRegistros();
listaRegistros.replaceChildren();
if (!items.length) { const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "Aún no hay registros. Agrega el primero con el formulario."; listaRegistros.append(empty); return; }
items.forEach((item, index) => {
  const row = document.createElement("article"); row.className = "list-row";
  const content = document.createElement("div");
  const title = document.createElement("strong"); title.textContent = item[0] || ${jsonScript(section.etiqueta)};
  const detail = document.createElement("p"); detail.textContent = item.slice(1).filter(Boolean).join(" · ");
  content.append(title, detail);
  const remove = document.createElement("button"); remove.type = "button"; remove.className = "text-link"; remove.textContent = "Eliminar";
  remove.addEventListener("click", () => { const next = leerRegistros(); next.splice(index, 1); guardarRegistros(next); pintarRegistros(); });
  row.append(content, remove); listaRegistros.append(row);
});
}
formularioRegistros.addEventListener("submit", (event) => {
event.preventDefault();
const data = new FormData(formularioRegistros);
const values = [...data.values()].map((value) => String(value).trim());
const items = leerRegistros(); items.unshift(values); guardarRegistros(items);
formularioRegistros.reset(); pintarRegistros();
});
pintarRegistros();
`);
  } else if (section.tipo === "contacto") {
    const fields = section.campos
      .map((field) => {
        const type = /correo|email/i.test(field) ? "email" : /tel[eé]fono|celular/i.test(field) ? "tel" : "text";
        const control = /mensaje/i.test(field)
          ? `<textarea name="${esc(field)}" required></textarea>`
          : `<input name="${esc(field)}" type="${type}" required />`;
        return `<label>${esc(field)}${control}</label>`;
      })
      .join("");
    parts.push(`<section id="${id}">${actionId === "accion" ? '<span id="accion"></span>' : ""}${heading("Hablemos", section.titulo, section.nota)}
<form id="contacto-${index}" class="form-grid">${fields}<div class="form-actions"><button class="button" type="submit">Guardar mensaje <span aria-hidden="true">→</span></button><span class="subtle">Este prototipo no envía correos.</span></div></form>
<div class="list" id="mensajes-${index}" aria-live="polite"></div></section>`);
    scripts.push(`
const claveContacto = ${jsonScript(`${storageKey}-contacto`)};
const formContacto = document.getElementById(${jsonScript(`contacto-${index}`)});
const mensajes = document.getElementById(${jsonScript(`mensajes-${index}`)});
let memoriaMensajes = [];
function leerMensajes() {
try {
  const raw = localStorage.getItem(claveContacto);
  if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed; }
  } catch {}
  return memoriaMensajes;
}
function guardarMensajes(items) {
  memoriaMensajes = items;
  try { localStorage.setItem(claveContacto, JSON.stringify(items)); } catch {}
}
function pintarMensajes() {
  const items = leerMensajes();
  mensajes.replaceChildren();
  if (!items.length) { const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "Todavía no hay mensajes guardados."; mensajes.append(empty); return; }
  items.forEach((item) => {
    const row = document.createElement("article");
    row.className = "list-row";
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
  const submit = formContacto.querySelector('button[type="submit"]');
  if (submit) { submit.textContent = "Mensaje guardado"; setTimeout(() => { submit.innerHTML = 'Guardar mensaje <span aria-hidden="true">→</span>'; }, 1800); }
});
pintarMensajes();
`);
    } else if (section.tipo === "agente") {
  parts.push(`<section id="${id}">${heading("Tu asistente", section.nombre, section.mision)}<div class="notice"><span class="notice-mark" aria-hidden="true">i</span><span>Prototipo interactivo: responde con los ejemplos incluidos. Para conversaciones con IA en vivo hace falta conectar un modelo y publicarlo con un backend.</span></div><div class="grid cards">${section.reglas
    .map((rule, ruleIndex) => `<article><span class="card-index" aria-hidden="true">${String(ruleIndex + 1).padStart(2, "0")}</span><p>${esc(rule)}</p></article>`)
    .join("")}</div></section>
<section id="${actionId}">${heading("Pruébalo", "Una conversación de muestra", "Ensaya algunas preguntas para ver el tono y la información que conoce este prototipo.")}<div class="example-prompts">${section.ejemplos.slice(0, 4).map((example, exampleIndex) => `<button class="example-prompt" type="button" data-example="${index}-${exampleIndex}">${esc(example.persona)}</button>`).join("")}</div><div class="chat" id="chat-${index}" aria-live="polite"></div>
<form id="sim-${index}"><label for="mensaje-${index}">Escribe una pregunta<textarea id="mensaje-${index}" name="mensaje" required placeholder="¿En qué te puede ayudar?"></textarea></label><button class="button" type="submit">Enviar mensaje <span aria-hidden="true">→</span></button></form></section>`);
      scripts.push(`
const ejemplos = ${jsonScript(section.ejemplos)};
const reglas = ${jsonScript(section.reglas)};
const chat = document.getElementById(${jsonScript(`chat-${index}`)});
function burbuja(texto, clase) {
  const node = document.createElement("p");
  node.className = "bubble " + clase;
  node.textContent = texto;
  chat.append(node);
}
function responder(texto) {
  const stop = new Set(["para","como","quiero","puedo","tiene","tienen","esta","este","hacer","cuando","donde","hola","buenas","favor","sobre","cuanto","cuánto","necesito"]);
  const normalize = (value) => value.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase();
  const words = normalize(texto).split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !stop.has(word));
  let best = null;
  let score = 0;
  for (const example of ejemplos) {
    const hay = new Set(normalize(example.persona).split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !stop.has(word)));
    const points = words.filter((word) => hay.has(word)).length / Math.max(words.length, 1);
    if (points > score) { score = points; best = example; }
  }
  if (best && score >= .35) return best.respuesta;
  const fallback = reglas.find((rule) => /persona|equipo|escal|confirm|contact/i.test(rule));
  return fallback ? "No tengo una respuesta específica para eso en esta demo. " + fallback : "No tengo una respuesta específica para eso en esta demo. Cuéntame un poco más o contacta al equipo para que una persona te ayude.";
}
burbuja(${jsonScript(section.mision)}, "agent");
const formularioAgente = document.getElementById(${jsonScript(`sim-${index}`)});
function conversar(text) {
  burbuja(text, "person");
  burbuja(responder(text), "agent");
}
formularioAgente.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const text = String(data.get("mensaje") || "");
  conversar(text);
  event.currentTarget.reset();
});
document.querySelectorAll('[data-example^="${index}-"]').forEach((button) => button.addEventListener("click", () => conversar(ejemplos[Number(button.dataset.example.split("-")[1])].persona)));
`);
    }
  }

  return shell({
    title,
    color,
    body: parts.join("\n"),
    script: scripts.map((script) => `(()=>{${script}})();`).join("\n"),
    links,
    storesLocally: sections.some((section) => section.tipo === "agenda" || section.tipo === "herramienta" || section.tipo === "contacto"),
  });
}

function readme(project: { title: string; kind: ProjectKind; summary: string }) {
  const kindLabel = project.kind === "app" ? "app" : project.kind === "sitio" ? "sitio" : "agente";
  return `${project.title}

${project.summary}

Cómo usarlo
1. Abre index.html en Chrome, Edge, Safari o Firefox.
2. Las citas, registros y mensajes de prueba se guardan sólo en ese navegador.
3. Para publicarlo, sube esta carpeta a un hosting de archivos estáticos.

Alcance del prototipo
- Este ${kindLabel} no trae base de datos, cuentas de usuario, pagos ni sincronización entre dispositivos.
- Los formularios no envían datos a un negocio ni a un servidor: sólo guardan una copia local en el navegador.
- La demostración del agente responde usando ejemplos predeterminados; no está conectada a un modelo de IA.

Para operar con clientes reales necesitarás backend, almacenamiento seguro, controles de privacidad y las integraciones que correspondan. Pídele a Vega dentro de LYRA que te ayude a planear esa siguiente versión.
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
        prompt: [
          `Identidad: Eres ${agent.nombre}, un asistente especializado.`,
          `Misión: ${agent.mision}`,
          "Atiende en español natural, con tono claro, cálido y profesional. Resuelve una necesidad a la vez; pregunta sólo por el dato indispensable y resume los siguientes pasos.",
          `Reglas obligatorias:\n${agent.reglas.map((rule, index) => `${index + 1}. ${rule}`).join("\n")}`,
          "No inventes precios, disponibilidad, políticas, resultados, diagnósticos ni datos personales. Si falta información, dilo y pregunta. No afirmes que reservaste, enviaste o guardaste algo si una herramienta conectada no lo confirma.",
          "Cuando el caso esté fuera de alcance, haya riesgo o la persona pida hablar con alguien, explica el límite y deriva a una persona con el contexto relevante.",
          `Ejemplos de tono y alcance:\n${agent.ejemplos.map((example) => `Persona: ${example.persona}\nRespuesta: ${example.respuesta}`).join("\n\n")}`,
          "Implementación: este archivo es una especificación para conectar a un modelo y herramientas. No contiene credenciales ni incluye conexión de IA activa.",
        ].join("\n\n"),
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
    return { ok: false, error: "Un agente necesita misión, al menos 3 reglas y 3 ejemplos de conversación." };
  }
  if (projectKind === "sitio" && (!parsed.some((section) => section.tipo === "portada") || !parsed.some((section) => section.tipo === "contacto" || section.tipo === "agenda"))) {
    return { ok: false, error: "Un sitio necesita una portada y una forma clara de contacto o conversión." };
  }
  if (projectKind === "sitio" && parsed.length < 5) {
    return { ok: false, error: "Una landing profesional necesita al menos cinco secciones útiles; completa la propuesta, oferta, proceso o preguntas frecuentes sin inventar datos." };
  }
  if (projectKind === "app" && !parsed.some((section) => section.tipo === "agenda" || section.tipo === "contacto" || section.tipo === "herramienta")) {
    return { ok: false, error: "Una app necesita una sección de agenda, herramienta o contacto para que la persona pueda usarla." };
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
