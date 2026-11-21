// PR 1 (entrega): «sitio listo» = el HTML único ya compilado de una versión (JS y CSS en línea),
// listo para subir a cualquier hosting estático, más una guía honesta de cómo publicarlo.
import type { ProjectFile, ProjectKind } from "@/lib/vega/build-project";

export const handoffFolder = "sitio-listo";
export const handoffGuidePath = "COMO-PUBLICAR.md";

/** Solo sitios y apps tienen un archivo publicable (un agente es una simulación). */
export function hasReadySite(kind: ProjectKind) {
  return kind === "sitio" || kind === "app";
}

function baseName(title: string) {
  return (
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "sitio"
  );
}

export function readySiteFileName(title: string, number: number) {
  return `${baseName(title)}-v${number}.html`;
}

/** Guía en español, sin promesas: qué es el archivo, cómo subirlo y qué no hace todavía. */
export function hostingGuide(input: {
  title: string;
  kind: ProjectKind;
  number: number;
  generator: string;
}) {
  const app = input.kind === "app";
  const premium = input.generator === "vega-v2";
  return `# Cómo publicar «${input.title}» (versión ${input.number})

En \`${handoffFolder}/index.html\` está ${app ? "la app" : "el sitio"} completo en **un solo archivo**: el código y los estilos ya van dentro. No necesitas instalar nada para publicarlo.

## Opción rápida (sin saber programar)

1. **Netlify Drop**: entra a https://app.netlify.com/drop y arrastra la carpeta \`${handoffFolder}\`. Te da una dirección pública con HTTPS en segundos; después puedes conectar tu dominio desde Netlify.
2. **Tu hosting actual (cPanel, Hostinger, GoDaddy…)**: sube \`index.html\` a la carpeta pública (\`public_html\`) con el administrador de archivos.
3. **Vercel**: crea un proyecto nuevo, sube la carpeta \`${handoffFolder}\` y publica.

Para usar tu propio dominio (por ejemplo \`www.tunegocio.com\`), agrégalo en el panel de tu hosting y sigue sus instrucciones de DNS. El HTTPS lo da el hosting.

## Qué hace y qué no hace (léelo antes de entregarlo a un cliente)

- Las páginas usan enlaces con \`#\` (por ejemplo \`/#/servicios\`): funcionan en cualquier hosting sin configurar nada, pero para Google cuenta como una sola página.
- Las tipografías se cargan de Google Fonts; si hay imágenes, vienen de images.unsplash.com.
${
  app
    ? "- Los datos que captura la app se guardan **en el navegador de cada persona** (localStorage). Cada dispositivo tiene su propia copia; no hay inicio de sesión. Si la app tiene «Datos en vivo» activado en LYRA, publicada en su dirección de LYRA (/s/…) cada persona entra con su PIN y los datos se comparten entre dispositivos y sucursales; fuera de LYRA trabaja local.\n"
    : "- Los formularios de este archivo **no envían correos ni guardan datos en un servidor**: muestran una confirmación y, si el sitio tiene WhatsApp, abren el mensaje listo para enviar. Si lo publicas desde LYRA (dirección /s/…), los formularios sí llegan a la bandeja de Contactos del proyecto.\n"
}- No incluye cobros en línea ni analítica.
- Revisa precios, horarios, teléfonos y textos antes de publicarlo: salen de lo que se le dio a Vega.
${
  premium
    ? `
## ¿Quieres modificar el código?

El resto del ZIP es el proyecto fuente (React 19 + Vite + Tailwind CSS v4). Con Node.js instalado:

\`\`\`bash
npm install
npm run build   # genera dist/ para cualquier hosting estático
\`\`\`
`
    : ""
}
---
Hecho con LYRA.
`;
}

/** Archivos que se agregan al ZIP para entregarlo listo para publicar. */
export function handoffFiles(input: {
  title: string;
  kind: ProjectKind;
  number: number;
  generator: string;
  html: string;
}): ProjectFile[] {
  return [
    { path: handoffGuidePath, content: hostingGuide(input) },
    { path: `${handoffFolder}/index.html`, content: input.html },
  ];
}

/** Une el código con los archivos de entrega sin pisar rutas que ya existan. */
export function withHandoff(files: ProjectFile[], extra: ProjectFile[]) {
  const taken = new Set(files.map((file) => file.path));
  return [...files, ...extra.filter((file) => !taken.has(file.path))];
}
