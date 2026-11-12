// Biblioteca curada de secciones del generador v2: 40 de sitio y 13 de app.
// Cada una trae una receta (lo que el modelo debe construir) y una plantilla de respaldo.
import { appTemplatesA } from "@/lib/builder/sections/app-a";
import { appTemplatesB } from "@/lib/builder/sections/app-b";
import type { SectionTemplate } from "@/lib/builder/sections/render";
import { convertTemplates } from "@/lib/builder/sections/site-convert";
import { featureTemplates } from "@/lib/builder/sections/site-features";
import { heroTemplates } from "@/lib/builder/sections/site-hero";
import { navTemplates } from "@/lib/builder/sections/site-nav";
import { proofTemplates } from "@/lib/builder/sections/site-proof";
import type { BuildKind } from "@/lib/builder/types";

export type SectionRole = "section" | "nav" | "footer" | "shell";

export type SectionDef = {
  id: string;
  category: string;
  kind: BuildKind;
  role: SectionRole;
  label: string;
  /** Receta de diseño para el modelo. */
  recipe: string;
  /** Palabras del brief que la favorecen. */
  tags: string[];
};

const S = (id: string, category: string, label: string, recipe: string, tags: string[] = [], role: SectionRole = "section"): SectionDef => ({
  id,
  category,
  kind: "sitio",
  role,
  label,
  recipe,
  tags,
});
const A = (id: string, category: string, label: string, recipe: string, tags: string[] = [], role: SectionRole = "section"): SectionDef => ({
  id,
  category,
  kind: "app",
  role,
  label,
  recipe,
  tags,
});

export const sectionLibrary: SectionDef[] = [
  S("nav-minimal", "nav", "Barra fija minimal", "Barra superior fija con fondo translúcido y blur, marca a la izquierda, enlaces centrados, botón CTA a la derecha y menú móvil desplegable.", [], "nav"),
  S("nav-centered", "nav", "Marca centrada editorial", "Marca grande centrada con lema en versalitas espaciadas y enlaces debajo; CTA como enlace subrayado; menú móvil.", ["restaurante", "boutique", "lujo", "boda"], "nav"),
  S("nav-pill", "nav", "Cápsula flotante", "Barra en forma de píldora flotante con sombra, monograma circular con la inicial, enlaces tipo chip y CTA oscuro con flecha.", ["startup", "app", "agencia"], "nav"),
  S("hero-split", "hero", "Héroe dividido", "Héroe a dos columnas: insignia, titular grande, subtítulo, dos botones y tres puntos de confianza con check; a la derecha un panel visual con degradados y tarjeta flotante.", ["servicio", "clinica", "consultoria"]),
  S("hero-centered", "hero", "Héroe centrado con brillo", "Héroe centrado de gran tamaño con resplandor radial del color primario detrás, insignia con ícono, titular de 2 líneas y dos botones.", ["software", "startup", "lanzamiento"]),
  S("hero-editorial", "hero", "Héroe editorial", "Titular serif enorme en 8 columnas y a la derecha, separado por una línea fina, un párrafo y un enlace subrayado con flecha.", ["restaurante", "autor", "despacho", "arquitectura"]),
  S("hero-bento", "hero", "Héroe en mosaico", "Mosaico: bloque grande de color primario con titular y CTA ocupando 2×2, y dos tarjetas pequeñas con ícono y beneficio.", ["agencia", "tecnologia", "cursos"]),
  S("hero-stats", "hero", "Héroe con cifras", "Titular en mayúsculas muy grande, subtítulo, botones y una franja de 3-4 cifras clave en cuadrícula con líneas.", ["gimnasio", "logistica", "industria", "fitness"]),
  S("hero-offer", "hero", "Héroe de oferta local", "Héroe para negocio local: etiqueta de promoción, titular, CTA y datos de horario/dirección/teléfono con íconos; panel visual a la derecha.", ["restaurante", "cafe", "taqueria", "barberia", "local"]),
  S("logos-strip", "social", "Franja de clientes", "Franja horizontal con frase de confianza a la izquierda y nombres de clientes/aliados en tipografía display atenuada.", ["b2b", "agencia"]),
  S("features-grid", "features", "Beneficios en cuadrícula", "Encabezado centrado y cuadrícula de 3 columnas de tarjetas con ícono en cuadro de color, título y texto; efecto hover que eleva.", []),
  S("features-alternating", "features", "Beneficios alternados", "Filas grandes alternadas texto/visual con numeración 01, 02… y un panel visual con ícono grande y degradado.", ["proceso", "software"]),
  S("features-bento", "features", "Funciones en bento", "Cuadrícula bento de 6 columnas con 5 tarjetas de tamaños distintos (una 4×2), círculos decorativos y escala en hover.", ["app", "software", "plataforma"]),
  S("features-checklist", "features", "Lista de lo que incluye", "Dos columnas: encabezado + CTA a la izquierda; a la derecha lista de tarjetas con check circular de color.", ["paquete", "membresia", "curso"]),
  S("services-cards", "services", "Servicios en tarjetas", "Encabezado con botón secundario alineado a la derecha y cuadrícula de tarjetas con ícono, precio opcional en chip, descripción y pie con detalle.", ["servicios", "clinica", "estetica"]),
  S("services-list", "services", "Servicios en índice", "Lista tipo índice con números 01-10, nombre grande que cambia de color al pasar, descripción, precio y flecha; encabezado fijo a la izquierda.", ["despacho", "consultoria", "arquitectura", "editorial"]),
  S("process-steps", "process", "Pasos numerados", "Encabezado centrado y 3-4 tarjetas de pasos con círculo numerado de color primario.", ["proceso", "como funciona"]),
  S("process-timeline", "process", "Línea de tiempo", "Encabezado a la izquierda; a la derecha línea vertical con puntos de color, etiqueta de etapa, título y texto.", ["historia", "proyecto", "construccion"]),
  S("stats-band", "social", "Franja de cifras", "Franja de fondo primario a todo lo ancho con 3-4 cifras grandes y su descripción.", ["resultados", "experiencia"]),
  S("testimonials-grid", "social", "Testimonios en cuadrícula", "Cuadrícula de testimonios con 5 estrellas, cita, avatar con inicial, nombre y contexto.", ["clientes", "reseñas"]),
  S("testimonial-spotlight", "social", "Testimonio destacado", "Un solo testimonio grande centrado sobre fondo surface-2 con comillas grandes y cita en tipografía display.", ["lujo", "boda", "editorial"]),
  S("pricing-tiers", "pricing", "Planes de precio", "Tres planes en tarjetas; el central destacado en color primario y elevado; lista de características con check y botón.", ["membresia", "planes", "suscripcion", "gimnasio"]),
  S("pricing-list", "pricing", "Lista de precios", "Lista de precios elegante: nombre y descripción a la izquierda, precio en color a la derecha, separadores finos.", ["salon", "barberia", "spa", "taller"]),
  S("faq-accordion", "faq", "Preguntas en acordeón", "Acordeón de preguntas con chevron que rota; una abierta por defecto; contenedor con bordes y divisores.", []),
  S("faq-columns", "faq", "Preguntas en columnas", "Encabezado a la izquierda y preguntas/respuestas en dos columnas sin acordeón.", ["despacho", "corporativo"]),
  S("gallery-mosaic", "gallery", "Galería mosaico", "Mosaico de 4 columnas con piezas de distintos tamaños, pies de foto en cápsula translúcida; degradados si no hay fotos.", ["fotografia", "interiorismo", "restaurante", "boda", "tatuajes"]),
  S("portfolio-cases", "gallery", "Casos de éxito", "Tarjetas grandes de casos con portada, categoría, título, resultado y flecha.", ["agencia", "arquitectura", "consultoria", "construccion"]),
  S("team-grid", "about", "Equipo", "Cuadrícula de integrantes con retrato (o iniciales sobre degradado), nombre, rol y una línea.", ["clinica", "despacho", "equipo"]),
  S("about-story", "about", "Nuestra historia", "Dos columnas: panel visual y texto con encabezado, 2-3 párrafos y 3 datos clave abajo.", ["historia", "familia", "artesanal"]),
  S("values-grid", "about", "Valores", "Cuadrícula de valores separados por líneas de 1px sobre fondo surface-2, con ícono y texto.", ["fundacion", "escuela", "eco"]),
  S("menu-board", "menu", "Menú con categorías", "Carta con pestañas por categoría y platillos con línea punteada hasta el precio, descripción breve.", ["restaurante", "cafe", "taqueria", "bar", "pasteleria", "menu"]),
  S("booking-request", "booking", "Solicitud de cita", "Formulario de cita (nombre, servicio, fecha, hora) con confirmación en pantalla y botón para confirmar por WhatsApp.", ["cita", "agenda", "reservar", "clinica", "salon", "barberia"]),
  S("cta-banner", "cta", "Banner de cierre", "Bloque redondeado de color primario con círculos decorativos, titular grande, subtítulo y dos botones.", []),
  S("cta-newsletter", "cta", "Suscripción", "Franja con titular a la izquierda y campo de correo + botón a la derecha; mensaje de gracias al enviar.", ["blog", "tienda", "novedades"]),
  S("contact-split", "contact", "Contacto con formulario", "Dos columnas: datos de contacto con íconos + botón WhatsApp; formulario con confirmación en pantalla.", ["contacto"]),
  S("contact-cards", "contact", "Tarjetas de contacto", "Tarjetas de contacto (teléfono, WhatsApp, correo, dirección) con ícono en cuadro de color y horario abajo.", ["local", "tienda"]),
  S("blog-cards", "content", "Artículos", "Tres tarjetas de artículos con portada en degradado, categoría, título, resumen y «Leer más».", ["blog", "noticias", "recursos"]),
  S("comparison-table", "content", "Comparativa", "Tabla comparativa: criterio, columna propia con check en color primario y columna «lo común».", ["software", "seguros", "comparar"]),
  S("footer-columns", "footer", "Pie con columnas", "Pie de 4 columnas: marca y lema, navegación, contacto; franja inferior con derechos.", [], "footer"),
  S("footer-minimal", "footer", "Pie minimal", "Pie de una línea: marca, enlaces y derechos.", ["landing"], "footer"),
  A("app-shell-sidebar", "shell", "Marco con barra lateral", "Marco de app con barra lateral de 260px (marca, navegación con íconos y estado activo) y área principal; en móvil barra superior con menú.", ["gestion", "admin", "crm"], "shell"),
  A("app-shell-topbar", "shell", "Marco con barra superior", "Marco de app con barra superior fija, marca y pestañas de navegación desplazables.", ["simple", "registro"], "shell"),
  A("app-dashboard", "screen", "Tablero", "Tablero con tarjetas de conteo por entidad, total de dinero destacado y lista de registros recientes.", ["tablero", "resumen", "ventas"]),
  A("app-table", "screen", "Tabla con búsqueda", "Lista en tabla con búsqueda, filtro por campo de opciones, borrar con confirmación, estado vacío y contador.", ["clientes", "inventario", "lista"]),
  A("app-form", "screen", "Formulario de alta", "Formulario de alta generado del esquema con validación de obligatorios, confirmación y enlace de regreso.", ["registro", "alta"]),
  A("app-kanban", "screen", "Tablero kanban", "Columnas por estado (campo de opciones) con tarjetas que avanzan/retroceden.", ["pedidos", "tareas", "proyectos", "seguimiento"]),
  A("app-agenda", "screen", "Agenda", "Agenda agrupada por día con hora, alta rápida en línea y estado vacío.", ["citas", "agenda", "reservas", "clases"]),
  A("app-master-detail", "screen", "Maestro-detalle", "Lista a la izquierda y detalle a la derecha con edición en línea de cada campo.", ["expedientes", "pacientes", "contactos"]),
  A("app-settings", "screen", "Ajustes", "Formulario de ajustes del negocio guardado localmente con aviso de guardado.", ["ajustes"]),
  A("app-chart", "screen", "Gráfica", "Gráfica de barras de una entidad agrupada por campo de opciones (o mes), sumando dinero si existe.", ["reportes", "ventas", "estadisticas"]),
  A("app-activity", "screen", "Actividad reciente", "Feed de actividad con los últimos cambios de todas las entidades.", ["historial"]),
  A("app-pos", "screen", "Punto de venta", "Catálogo de productos en botones, carrito con cantidades, total y cobro que registra el pedido.", ["ventas", "pos", "pedidos", "tienda", "cafeteria"]),
  A("app-welcome", "screen", "Bienvenida", "Encabezado de bienvenida en color primario y accesos rápidos en tarjetas con ícono.", ["inicio"]),
];

export const sectionTemplates: Record<string, SectionTemplate> = {
  ...navTemplates,
  ...heroTemplates,
  ...featureTemplates,
  ...proofTemplates,
  ...convertTemplates,
  ...appTemplatesA,
  ...appTemplatesB,
};

const byId = new Map(sectionLibrary.map((def) => [def.id, def]));

export function getSectionDef(id: string | null | undefined) {
  return id ? byId.get(id) ?? null : null;
}

export function sectionsFor(kind: BuildKind, role?: SectionRole) {
  return sectionLibrary.filter((def) => def.kind === kind && (!role || def.role === role));
}
