// Fixtures deterministas del generador v2: briefs reales de socios y un «modelo» falso que
// responde el plan con contenido escrito a mano y cada archivo con la sección de la biblioteca.
import { fileTasks } from "@/lib/builder/scaffold";
import { templateSource } from "@/lib/builder/generate";
import type { BuilderModel } from "@/lib/builder/model";
import { composeSkeleton, normalizePlan } from "@/lib/builder/plan";
import { getSectionDef } from "@/lib/builder/sections";
import type { BuildKind, BuildPlan, Entity, SectionItem } from "@/lib/builder/types";

type Bank = {
  id: string;
  kind: BuildKind;
  title: string;
  brief: string;
  brand: BuildPlan["brand"];
  summary: string;
  hero: { eyebrow: string; title: string; subtitle: string; cta: string; secondary?: string };
  benefits: SectionItem[];
  services: SectionItem[];
  steps: SectionItem[];
  testimonials: SectionItem[];
  faq: SectionItem[];
  stats: SectionItem[];
  extra?: { menu?: SectionItem[]; plans?: SectionItem[]; team?: SectionItem[]; cases?: SectionItem[]; story?: string; clients?: SectionItem[] };
  closing: { title: string; subtitle: string; cta: string };
  entities?: Entity[];
  screens?: Record<string, { title: string; subtitle?: string }>;
};

export const banks: Bank[] = [
  {
    id: "dental",
    kind: "sitio",
    title: "Sonríe Pachuca",
    brief: "Sitio web para Sonríe Pachuca, clínica dental familiar en Pachuca, Hidalgo. Ortodoncia, limpieza, blanqueamiento e implantes. Queremos que agenden cita por WhatsApp. Equipo de 3 dentistas con 12 años de experiencia. Horario lunes a sábado 9 a 19 h.",
    brand: { name: "Sonríe Pachuca", tagline: "Odontología familiar sin miedo ni sorpresas", whatsapp: "771 123 4567", phone: "771 123 4567", address: "Blvd. Felipe Ángeles 210, Pachuca", hours: "Lun a sáb · 9:00 a 19:00" },
    summary: "Clínica dental familiar en Pachuca con ortodoncia, implantes y citas por WhatsApp.",
    hero: { eyebrow: "Clínica dental en Pachuca", title: "Tu sonrisa en manos de un equipo que te explica todo", subtitle: "Diagnóstico claro, presupuesto por escrito y tratamientos sin dolor para toda la familia.", cta: "Agendar cita", secondary: "Ver tratamientos" },
    benefits: [
      { title: "Presupuesto por escrito", text: "Antes de empezar sabes cuánto cuesta y cuántas sesiones necesitas.", icon: "FileText" },
      { title: "Sin dolor", text: "Anestesia computarizada y técnicas mínimamente invasivas.", icon: "Smile" },
      { title: "Toda la familia", text: "Atendemos niños, adultos y adultos mayores en un solo lugar.", icon: "Users" },
    ],
    services: [
      { title: "Ortodoncia", text: "Brackets estéticos y alineadores transparentes con seguimiento mensual.", icon: "Sparkles" },
      { title: "Limpieza dental", text: "Profilaxis con ultrasonido y revisión completa en 45 minutos.", icon: "Droplet" },
      { title: "Blanqueamiento", text: "Hasta 6 tonos más claro en una sola sesión en consultorio.", icon: "Sun" },
      { title: "Implantes", text: "Recupera piezas perdidas con implantes de titanio y coronas de zirconia.", icon: "ShieldCheck" },
    ],
    steps: [
      { title: "Escríbenos", text: "Agenda por WhatsApp en menos de 2 minutos." },
      { title: "Valoración", text: "Revisamos, tomamos radiografía y resolvemos tus dudas." },
      { title: "Tu plan", text: "Recibes un plan de tratamiento y presupuesto por escrito." },
    ],
    testimonials: [
      { title: "Mariana", meta: "Paciente de ortodoncia", text: "Me explicaron cada paso y el tratamiento terminó antes de lo que esperaba." },
      { title: "Jorge", meta: "Implante", text: "Le tenía miedo al dentista y aquí por fin me sentí tranquilo." },
      { title: "Lucía", meta: "Mamá de dos pacientes", text: "Mis hijos salen contentos de cada cita. Así de fácil." },
    ],
    faq: [
      { title: "¿Atienden urgencias?", text: "Sí, en horario de clínica damos prioridad a dolor o fracturas." },
      { title: "¿Aceptan tarjeta?", text: "Aceptamos efectivo, transferencia y tarjeta de crédito o débito." },
      { title: "¿Cuánto dura la primera cita?", text: "Alrededor de 40 minutos, incluyendo la valoración." },
    ],
    stats: [
      { title: "12 años", text: "de experiencia" },
      { title: "3", text: "especialistas" },
      { title: "6 días", text: "a la semana" },
    ],
    extra: {
      team: [
        { title: "Dra. Paola Ruiz", meta: "Ortodoncista" },
        { title: "Dr. Iván Soto", meta: "Implantología" },
        { title: "Dra. Karla Mena", meta: "Odontopediatría" },
      ],
      story: "Abrimos la clínica en 2014 con una idea sencilla: que ir al dentista no dé miedo.\nHoy atendemos a familias completas de Pachuca con la misma cercanía del primer día.",
    },
    closing: { title: "Agenda hoy tu valoración", subtitle: "Respondemos por WhatsApp en horario de clínica.", cta: "Agendar por WhatsApp" },
  },
  {
    id: "tacos",
    kind: "sitio",
    title: "El Fogón de Doña Mari",
    brief: "Página para nuestra taquería y food truck El Fogón de Doña Mari en Pachuca: tacos al pastor, de suadero y gringas, salsas de la casa. Queremos mostrar el menú con precios y que nos encuentren en eventos y fiestas. Pedidos por WhatsApp.",
    brand: { name: "El Fogón de Doña Mari", tagline: "Tacos al carbón desde 1998", whatsapp: "771 987 6543", address: "Av. Juárez 45, Pachuca", hours: "Mar a dom · 18:00 a 01:00" },
    summary: "Taquería y food truck con menú, precios y pedidos por WhatsApp.",
    hero: { eyebrow: "¡Hoy hay pastor!", title: "Tacos al carbón como los de la abuela", subtitle: "Tortilla hecha a mano, salsas de molcajete y el trompo girando desde las 6 de la tarde.", cta: "Ver menú", secondary: "Pedir por WhatsApp" },
    benefits: [
      { title: "Tortilla a mano", text: "Nixtamal del día, nada de tortilla de paquete.", icon: "Flame" },
      { title: "Salsas de la casa", text: "Cuatro salsas de molcajete, de suave a picosita.", icon: "Droplet" },
      { title: "Llevamos el trompo", text: "Food truck para fiestas, bodas y eventos de empresa.", icon: "Truck" },
    ],
    services: [],
    steps: [
      { title: "Elige tu evento", text: "Cumpleaños, boda o evento de oficina." },
      { title: "Cotiza por WhatsApp", text: "Dinos fecha, lugar y número de invitados." },
      { title: "Llegamos con todo", text: "Trompo, taquero, salsas y servicio." },
    ],
    testimonials: [
      { title: "Fer", meta: "Cliente desde 2015", text: "El pastor más jugoso de Pachuca, y la salsa verde no tiene comparación." },
      { title: "Andrea", meta: "Boda en Mineral del Chico", text: "Los invitados todavía hablan del trompo. ¡Gracias, Doña Mari!" },
      { title: "Toño", meta: "Evento de oficina", text: "Puntuales, limpios y con mucho sabor." },
    ],
    faq: [
      { title: "¿Hacen envíos?", text: "Sí, por WhatsApp en un radio de 5 km." },
      { title: "¿Cuántos invitados para el food truck?", text: "Desde 40 personas." },
      { title: "¿Tienen opciones sin carne?", text: "Sí: tacos de nopal, champiñón y quesadillas." },
    ],
    stats: [
      { title: "1998", text: "abrimos el primer puesto" },
      { title: "4", text: "salsas de la casa" },
      { title: "+300", text: "eventos atendidos" },
    ],
    extra: {
      menu: [
        { title: "Taco al pastor", price: "$22", meta: "Tacos", text: "Con piña asada, cebolla y cilantro." },
        { title: "Taco de suadero", price: "$22", meta: "Tacos", text: "Suave y dorado en la plancha." },
        { title: "Campechano", price: "$25", meta: "Tacos", text: "Suadero con longaniza." },
        { title: "Gringa", price: "$58", meta: "Especialidades", text: "Tortilla de harina, pastor y queso." },
        { title: "Volcán", price: "$35", meta: "Especialidades", text: "Tostada con queso gratinado y carne." },
        { title: "Agua de horchata", price: "$30", meta: "Bebidas", text: "Medio litro, hecha en casa." },
      ],
    },
    closing: { title: "¿Antojo o fiesta?", subtitle: "Pide por WhatsApp o cotiza el food truck para tu evento.", cta: "Pedir por WhatsApp" },
  },
  {
    id: "crossfit",
    kind: "sitio",
    title: "Hierro Box",
    brief: "Sitio para Hierro Box, gimnasio de crossfit y entrenamiento funcional en Pachuca. Clases de 6 am a 9 pm, coaches certificados, planes mensuales. Estilo oscuro, intenso. Clase de prueba gratis.",
    brand: { name: "Hierro Box", tagline: "Entrena fuerte. Entrena en comunidad.", whatsapp: "771 555 0101", address: "Calle Allende 300, Pachuca", hours: "Lun a vie 6–21 h · Sáb 8–13 h" },
    summary: "Box de crossfit con planes mensuales y clase de prueba gratis.",
    hero: { eyebrow: "Crossfit · Funcional · Halterofilia", title: "Más fuerte cada semana", subtitle: "Clases guiadas de 60 minutos con coaches que corrigen cada repetición. Tu primera clase es gratis.", cta: "Reservar clase gratis", secondary: "Ver planes" },
    benefits: [
      { title: "Coaches certificados", text: "Te corrigen técnica en cada movimiento.", icon: "Award" },
      { title: "Clases de 60 min", text: "Calentamiento, técnica y WOD con escalamiento.", icon: "Timer" },
      { title: "Comunidad", text: "Entrenas acompañado, no solo con audífonos.", icon: "Users" },
      { title: "Seguimiento", text: "Medimos tus marcas para que veas progreso real.", icon: "TrendingUp" },
    ],
    services: [
      { title: "Crossfit", text: "WOD diario escalado a tu nivel.", icon: "Dumbbell" },
      { title: "Halterofilia", text: "Técnica de arranque y envión.", icon: "Trophy" },
      { title: "Funcional 50+", text: "Fuerza y movilidad a tu ritmo.", icon: "HeartPulse" },
    ],
    steps: [
      { title: "Reserva tu clase", text: "Elige horario por WhatsApp." },
      { title: "Evaluación", text: "Medimos movilidad y fuerza base." },
      { title: "Entrena", text: "Te asignamos plan y grupo." },
    ],
    testimonials: [
      { title: "Diego", meta: "Miembro desde 2022", text: "Bajé 9 kilos y por primera vez disfruto entrenar." },
      { title: "Sofía", meta: "Halterofilia", text: "Los coaches cuidan la técnica como nadie." },
      { title: "Raúl", meta: "Funcional 50+", text: "A mis 56 años me siento más fuerte que a los 40." },
    ],
    faq: [
      { title: "¿Necesito experiencia?", text: "No. Todo se escala a tu nivel." },
      { title: "¿Qué llevo a mi clase de prueba?", text: "Ropa cómoda, agua y ganas." },
      { title: "¿Hay regaderas?", text: "Sí, con lockers." },
    ],
    stats: [
      { title: "15", text: "clases al día" },
      { title: "6", text: "coaches" },
      { title: "1ª", text: "clase gratis" },
    ],
    extra: {
      plans: [
        { title: "Básico", meta: "3 clases por semana", price: "$799/mes", text: "12 clases al mes; Acceso a app de marcas; Evaluación inicial" },
        { title: "Ilimitado", meta: "El más elegido", price: "$1,099/mes", text: "Clases ilimitadas; Open box; Evaluación mensual" },
        { title: "Pareja", meta: "Dos personas", price: "$1,899/mes", text: "Ilimitado para 2; Open box; Evaluación mensual" },
      ],
      cases: [{ title: "Zona de pesas" }, { title: "Rack de 8 estaciones" }, { title: "Área de remo" }, { title: "Comunidad" }, { title: "Competencias" }, { title: "Open box" }],
    },
    closing: { title: "Tu primera clase va por nuestra cuenta", subtitle: "Reserva hoy y entrena esta semana.", cta: "Reservar clase gratis" },
  },
  {
    id: "contable",
    kind: "sitio",
    title: "Ruiz & Asociados",
    brief: "Sitio corporativo para Ruiz & Asociados, despacho contable y fiscal en Pachuca para pymes y personas físicas: contabilidad mensual, declaraciones, nómina y defensa fiscal ante el SAT. Transmitir confianza y profesionalismo. Agenda de consulta inicial.",
    brand: { name: "Ruiz & Asociados", tagline: "Contabilidad y estrategia fiscal para pymes", email: "contacto@ruizasociados.mx", phone: "771 222 3344", address: "Torre Platino, piso 4, Pachuca", hours: "Lun a vie · 9:00 a 18:00" },
    summary: "Despacho contable y fiscal para pymes con consulta inicial.",
    hero: { eyebrow: "Despacho contable en Pachuca", title: "Cumple con el SAT y enfócate en crecer", subtitle: "Llevamos tu contabilidad, nómina y declaraciones con reportes claros cada mes.", cta: "Agendar consulta", secondary: "Servicios" },
    benefits: [
      { title: "Reportes mensuales claros", text: "Sabes cuánto ganas y cuánto vas a pagar, sin tecnicismos.", icon: "BarChart3" },
      { title: "Cero multas", text: "Calendario de obligaciones y avisos con anticipación.", icon: "ShieldCheck" },
      { title: "Un contador asignado", text: "Siempre hablas con la misma persona.", icon: "User" },
    ],
    services: [
      { title: "Contabilidad mensual", text: "Registro, conciliaciones y estados financieros." },
      { title: "Declaraciones", text: "Mensuales y anuales para personas físicas y morales." },
      { title: "Nómina e IMSS", text: "Timbrado, cuotas obrero-patronales e Infonavit." },
      { title: "Defensa fiscal", text: "Atención de requerimientos y auditorías del SAT." },
    ],
    steps: [
      { title: "Diagnóstico", text: "Revisamos tu situación fiscal actual." },
      { title: "Propuesta", text: "Honorarios fijos según tu volumen." },
      { title: "Arranque", text: "Regularizamos y tomamos tus obligaciones." },
      { title: "Seguimiento", text: "Reporte y junta mensual." },
    ],
    testimonials: [{ title: "Gerardo M.", meta: "Director, distribuidora", text: "Pasamos de multas cada trimestre a tener todo en orden y con reportes que entiendo." }],
    faq: [
      { title: "¿Atienden personas físicas?", text: "Sí: RESICO, actividad empresarial y arrendamiento." },
      { title: "¿Cómo cobran?", text: "Honorario mensual fijo según el volumen de operaciones." },
      { title: "¿Pueden regularizarme?", text: "Sí, preparamos un plan para ponerte al corriente." },
      { title: "¿Trabajan en línea?", text: "Sí, con portal de documentos y juntas por videollamada." },
    ],
    stats: [
      { title: "+180", text: "empresas atendidas" },
      { title: "20 años", text: "de experiencia" },
      { title: "0", text: "multas en 2025" },
    ],
    extra: { clients: [{ title: "Grupo Minero" }, { title: "Hidalgo Logística" }, { title: "Farmacias Lúa" }, { title: "Constructora Real" }] },
    closing: { title: "Agenda tu consulta inicial", subtitle: "30 minutos para revisar tu caso y darte un plan.", cta: "Agendar consulta" },
  },
  {
    id: "bodas",
    kind: "sitio",
    title: "Velo & Lino",
    brief: "Sitio para Velo & Lino, wedding planner y diseño de bodas de lujo en Hidalgo y CDMX. Bodas en haciendas, diseño floral y coordinación del día. Galería de bodas, proceso y contacto. Estilo elegante.",
    brand: { name: "Velo & Lino", tagline: "Diseño y planeación de bodas", email: "hola@veloylino.mx" },
    summary: "Wedding planner de lujo con galería, proceso y contacto.",
    hero: { eyebrow: "Wedding planner · Hidalgo y CDMX", title: "Bodas que se sienten como ustedes", subtitle: "Diseñamos y coordinamos cada detalle para que solo se ocupen de disfrutar.", cta: "Platiquemos de su boda" },
    benefits: [
      { title: "Diseño a la medida", text: "Concepto, paleta y ambientación únicos para su historia.", icon: "Flower2" },
      { title: "Proveedores curados", text: "Trabajamos con los mejores de la región.", icon: "Gem" },
      { title: "Coordinación total", text: "El día de la boda nosotros resolvemos todo.", icon: "CalendarCheck" },
    ],
    services: [
      { title: "Planeación integral", text: "De la búsqueda de hacienda al último baile." },
      { title: "Diseño floral", text: "Arreglos y montaje con flor de temporada." },
      { title: "Coordinación del día", text: "Itinerario, proveedores y protocolo." },
    ],
    steps: [
      { title: "Primera cita", meta: "Semana 1", text: "Nos cuentan su historia y su visión." },
      { title: "Concepto", meta: "Mes 1", text: "Moodboard, paleta y presupuesto." },
      { title: "Producción", meta: "Meses 2 a 10", text: "Proveedores, pruebas y montaje." },
      { title: "El gran día", meta: "Boda", text: "Coordinación de principio a fin." },
    ],
    testimonials: [{ title: "Ana & Luis", meta: "Hacienda Santa María Regla", text: "No tuvimos que preocuparnos por nada. Todo fue exactamente como lo soñamos, incluso mejor." }],
    faq: [
      { title: "¿Con cuánta anticipación?", text: "Idealmente 10 a 12 meses antes." },
      { title: "¿Viajan fuera de Hidalgo?", text: "Sí, a CDMX y destinos cercanos." },
      { title: "¿Solo coordinación?", text: "Sí, desde 3 meses antes de la boda." },
    ],
    stats: [],
    extra: {
      cases: [
        { title: "Hacienda Santa María", meta: "Boda civil y religiosa", text: "180 invitados, montaje al aire libre." },
        { title: "Jardín en Coyoacán", meta: "Boda íntima", text: "60 invitados, cena larga bajo luces." },
        { title: "Mineral del Chico", meta: "Boda en el bosque", text: "Ceremonia entre pinos." },
        { title: "Casa Lamm", meta: "Recepción urbana", text: "Diseño floral monocromático." },
      ],
    },
    closing: { title: "Cuéntennos su historia", subtitle: "Respondemos en menos de 48 horas.", cta: "Escribirnos" },
  },
  {
    id: "crm",
    kind: "app",
    title: "Pulso CRM",
    brief: "App web CRM para nuestra agencia de marketing digital: registrar clientes y prospectos con etapa del embudo, valor estimado y fecha de seguimiento; ver un tablero, un kanban por etapa y reportes de ventas.",
    brand: { name: "Pulso CRM", tagline: "Tu embudo de ventas, claro" },
    summary: "CRM para agencia: clientes, embudo kanban y reportes.",
    hero: { eyebrow: "", title: "", subtitle: "", cta: "" },
    benefits: [],
    services: [],
    steps: [],
    testimonials: [],
    faq: [],
    stats: [],
    closing: { title: "", subtitle: "", cta: "" },
    entities: [
      {
        key: "prospectos",
        label: "Prospectos",
        singular: "Prospecto",
        icon: "Users",
        fields: [
          { key: "empresa", label: "Empresa", type: "text", required: true },
          { key: "contacto", label: "Contacto", type: "text" },
          { key: "etapa", label: "Etapa", type: "select", options: ["Nuevo", "Propuesta", "Negociación", "Ganado"] },
          { key: "valor", label: "Valor estimado", type: "money" },
          { key: "seguimiento", label: "Seguimiento", type: "date" },
        ],
        seed: [
          { empresa: "Café Tierra Alta", contacto: "Laura", etapa: "Propuesta", valor: 18000, seguimiento: "2026-11-18" },
          { empresa: "Clínica Vida", contacto: "Dr. Pérez", etapa: "Nuevo", valor: 25000, seguimiento: "2026-11-15" },
          { empresa: "Moda Lúa", contacto: "Iris", etapa: "Negociación", valor: 42000, seguimiento: "2026-11-20" },
          { empresa: "Taller Ruiz", contacto: "Óscar", etapa: "Ganado", valor: 12000, seguimiento: "2026-11-10" },
          { empresa: "Hotel Real", contacto: "Marta", etapa: "Propuesta", valor: 60000, seguimiento: "2026-11-25" },
        ],
      },
    ],
    screens: {
      "app-dashboard": { title: "Resumen del embudo", subtitle: "Así va tu mes" },
      "app-table": { title: "Prospectos", subtitle: "Busca y filtra por etapa" },
      "app-form": { title: "Nuevo prospecto" },
      "app-kanban": { title: "Embudo por etapa" },
      "app-chart": { title: "Valor por etapa" },
      "app-activity": { title: "Actividad reciente" },
      "app-settings": { title: "Ajustes de la agencia" },
    },
  },
  {
    id: "cafe",
    kind: "app",
    title: "Caja Raíz",
    brief: "App de punto de venta y pedidos para Raíz, cafetería orgánica y panadería natural: cobrar productos del catálogo, registrar pedidos y ver ventas por categoría.",
    brand: { name: "Raíz", tagline: "Cafetería orgánica · caja y pedidos" },
    summary: "Punto de venta para cafetería: catálogo, pedidos y ventas.",
    hero: { eyebrow: "", title: "", subtitle: "", cta: "" },
    benefits: [],
    services: [],
    steps: [],
    testimonials: [],
    faq: [],
    stats: [],
    closing: { title: "", subtitle: "", cta: "" },
    entities: [
      {
        key: "productos",
        label: "Productos",
        singular: "Producto",
        icon: "Coffee",
        fields: [
          { key: "nombre", label: "Nombre", type: "text", required: true },
          { key: "categoria", label: "Categoría", type: "select", options: ["Café", "Pan", "Bebida fría"] },
          { key: "precio", label: "Precio", type: "money" },
        ],
        seed: [
          { nombre: "Americano", categoria: "Café", precio: 38 },
          { nombre: "Capuchino de avena", categoria: "Café", precio: 58 },
          { nombre: "Concha de masa madre", categoria: "Pan", precio: 32 },
          { nombre: "Rol de canela", categoria: "Pan", precio: 45 },
          { nombre: "Cold brew", categoria: "Bebida fría", precio: 62 },
        ],
      },
      {
        key: "pedidos",
        label: "Pedidos",
        singular: "Pedido",
        icon: "Receipt",
        fields: [
          { key: "detalle", label: "Detalle", type: "text", required: true },
          { key: "total", label: "Total", type: "money" },
        ],
        seed: [{ detalle: "2 × Americano, 1 × Concha", total: 108 }],
      },
    ],
    screens: {
      "app-pos": { title: "Caja", subtitle: "Toca para agregar al pedido" },
      "app-table": { title: "Pedidos del día" },
      "app-chart": { title: "Ventas por categoría" },
      "app-settings": { title: "Datos de la cafetería" },
    },
  },
];

function sectionContent(bank: Bank, id: string, pageTitle: string): Record<string, unknown> {
  const def = getSectionDef(id);
  const category = def?.category ?? "";
  const cta = { label: bank.hero.cta || "Contáctanos", href: "/contacto" };
  if (bank.kind === "app") {
    const screen = bank.screens?.[id] ?? { title: pageTitle };
    const entity = id === "app-pos" ? bank.entities?.[0]?.key : id === "app-table" && bank.entities && bank.entities.length > 1 ? bank.entities[1].key : bank.entities?.[0]?.key;
    const listPath = `/${entity ?? "registros"}`;
    return {
      title: screen.title,
      subtitle: screen.subtitle ?? "",
      entity,
      ...(id === "app-table" ? { cta: { label: "Nuevo", href: `${listPath}/nuevo` } } : {}),
      ...(id === "app-form" ? { cta: { label: "Volver a la lista", href: listPath } } : {}),
      ...(id === "app-settings" ? { fields: ["Nombre comercial", "Teléfono", "Horario"] } : {}),
    };
  }
  const head = (title: string, subtitle = "", eyebrow = "") => ({ title, subtitle, eyebrow });
  if (category === "hero") {
    return {
      ...head(bank.hero.title, bank.hero.subtitle, bank.hero.eyebrow),
      cta,
      ...(bank.hero.secondary ? { secondary: { label: bank.hero.secondary, href: "#servicios" } } : {}),
      items: id === "hero-stats" ? bank.stats : bank.benefits,
      note: bank.brand.tagline,
    };
  }
  if (id === "logos-strip") return { title: "Confían en nosotros", items: bank.extra?.clients ?? [] };
  if (category === "features") return { ...head("Por qué elegirnos", "Lo que nos distingue en cada visita."), items: bank.benefits, cta };
  if (category === "services") return { ...head("Servicios", "Todo lo que necesitas en un solo lugar.", "Lo que hacemos"), items: bank.services.length ? bank.services : bank.benefits, cta };
  if (category === "process") return { ...head("Cómo trabajamos", "Un proceso simple y claro.", "Paso a paso"), items: bank.steps };
  if (id === "stats-band") return { title: bank.brand.tagline, items: bank.stats };
  if (id.startsWith("testimonial")) return { ...head("Lo que dicen de nosotros", "", "Testimonios"), items: bank.testimonials };
  if (id === "pricing-tiers") return { ...head("Planes", "Sin inscripción ni letras chiquitas.", "Precios"), items: bank.extra?.plans ?? [], cta };
  if (id === "pricing-list") return { ...head("Precios", "", "Lista"), items: bank.services };
  if (category === "faq") return { ...head("Preguntas frecuentes", "Si tienes otra duda, escríbenos."), items: bank.faq };
  if (category === "gallery") return { ...head("Nuestro trabajo", "", "Galería"), items: bank.extra?.cases ?? [] };
  if (id === "team-grid") return { ...head("Nuestro equipo", "Especialistas que te acompañan."), items: bank.extra?.team ?? [] };
  if (id === "about-story") return { ...head("Nuestra historia", "", "Nosotros"), note: bank.extra?.story ?? bank.summary, items: bank.stats };
  if (id === "values-grid") return { ...head("Lo que nos mueve"), items: bank.benefits };
  if (id === "menu-board") return { ...head("Menú", "Precios con IVA incluido.", "La carta"), items: bank.extra?.menu ?? [] };
  if (id === "booking-request") return { ...head("Agenda tu cita", "Elige servicio, día y hora."), items: bank.services, note: bank.brand.hours ?? "" };
  if (category === "cta") return { ...head(bank.closing.title, bank.closing.subtitle), cta: { label: bank.closing.cta, href: "/contacto" } };
  if (category === "contact") return { ...head("Hablemos", "Te respondemos el mismo día hábil.", "Contacto"), fields: ["Nombre", "Teléfono o correo", "Mensaje"] };
  if (id === "blog-cards") return { ...head("Recursos"), items: bank.benefits };
  if (id === "comparison-table") return { ...head("Comparativa"), items: bank.benefits };
  return { title: pageTitle };
}

/** JSON de plan que «respondería» el modelo para un banco de contenido. */
export function fixturePlanJson(bank: Bank) {
  const composition = composeSkeleton(bank.brief, bank.kind);
  const pages = composition.pages.map((page) => {
    let path = page.path;
    let sections = page.sections;
    let title = page.title;
    if (bank.kind === "app" && page.path.startsWith("/registros")) {
      const entity = page.path.endsWith("nuevo") ? bank.entities![0] : bank.entities!.length > 1 ? bank.entities![1] : bank.entities![0];
      path = page.path.replace("/registros", `/${entity.key}`);
      title = page.path.endsWith("nuevo") ? `Nuevo ${entity.singular.toLowerCase()}` : entity.label;
    }
    if (bank.kind === "app" && page.path === "/registros") sections = ["app-table"];
    return {
      path,
      title,
      sections: sections.map((id) => ({ id, content: sectionContent(bank, id, title) })),
    };
  });
  return {
    title: bank.title,
    summary: bank.summary,
    brand: bank.brand,
    designSystem: composition.system.id,
    chrome: composition.chrome.map((id) => ({ id, content: { title: bank.brand.name, cta: { label: bank.hero.cta || "Contacto", href: "/contacto" } } })),
    pages,
    entities: bank.entities ?? [],
    suggestions: ["Agregar fotos reales del negocio", "Conectar un dominio propio"],
    assumptions: ["Testimonios de ejemplo con nombre de pila; reemplázalos por reseñas reales."],
  };
}

export function fixturePlan(bank: Bank): BuildPlan {
  return normalizePlan(fixturePlanJson(bank), { brief: bank.brief, kind: bank.kind, composition: composeSkeleton(bank.brief, bank.kind), fallbackTitle: bank.title });
}

/**
 * Modelo falso determinista. `breakFiles` hace que esos archivos salgan rotos la primera vez
 * para probar la reparación.
 */
export function fixtureModel(bank: Bank, options: { breakFiles?: string[]; failPlan?: boolean } = {}): BuilderModel & { calls: { purpose: string }[] } {
  const plan = fixturePlan(bank);
  const tasks = fileTasks(plan);
  const calls: { purpose: string }[] = [];
  const broken = new Set(options.breakFiles ?? []);
  const usage = { provider: "gemini" as const, model: "gemini-2.5-flash", inputTokens: 3000, outputTokens: 2500, reportedCostUsd: null };
  const model = (async (input) => {
    calls.push({ purpose: input.purpose });
    if (input.purpose === "plan") {
      if (options.failPlan) return { ok: false as const, error: "sin modelo", usage: null };
      return { ok: true as const, text: "```json\n" + JSON.stringify(fixturePlanJson(bank)) + "\n```", usage };
    }
    const path = (input.user.match(/(?:Archivo:|archivo) (src\/[A-Za-z0-9/]+\.tsx)/) ?? [])[1];
    const task = tasks.find((item) => item.path === path);
    if (!task) return { ok: false as const, error: "archivo desconocido", usage };
    if (input.purpose === "file" && broken.has(task.path)) {
      return { ok: true as const, text: "```tsx\nimport { NoExiste } from \"lucide-react\";\nexport default function Roto() { return <div><NoExiste /></div>; }\n```", usage };
    }
    return { ok: true as const, text: "```tsx\n" + templateSource(plan, task) + "```", usage };
  }) as BuilderModel & { calls: { purpose: string }[] };
  model.calls = calls;
  return model;
}
