import { generateStill } from "@/lib/ai/media";

/**
 * Herramientas de asistente de Vega: comandos permitidos e imágenes.
 * El espacio de archivos vive en src/lib/vega/files.ts (base de datos).
 */

export type CommandSpec = {
  id: string;
  label: string;
  description: string;
  /** Construye los argumentos a partir de los campos que manda Vega. */
  build: (args: Record<string, unknown>) => { ok: true; cmd: string; args: string[] } | { ok: false; error: string };
};

/**
 * Comandos permitidos. NO se ejecuta shell libre: cada entrada fija el binario y
 * sólo acepta argumentos simples (sin metacaracteres). Cualquier acción sobre el
 * espacio de trabajo la ejecuta Node directamente, no el shell.
 */
export const commandAllowlist: CommandSpec[] = [
  {
    id: "date",
    label: "Fecha y hora",
    description: "Muestra la fecha y hora actual del servidor.",
    build: () => ({ ok: true, cmd: "date", args: [] }),
  },
  {
    id: "df",
    label: "Espacio en disco",
    description: "Muestra el espacio libre y usado del disco.",
    build: () => ({ ok: true, cmd: "df", args: ["-h"] }),
  },
  {
    id: "uptime",
    label: "Tiempo encendido",
    description: "Muestra cuánto lleva encendido el servidor y su carga.",
    build: () => ({ ok: true, cmd: "uptime", args: [] }),
  },
  {
    id: "node_version",
    label: "Versión de Node",
    description: "Muestra la versión de Node del servidor.",
    build: () => ({ ok: true, cmd: "node", args: ["--version"] }),
  },
];

export function findCommand(id: string) {
  return commandAllowlist.find((command) => command.id === id) ?? null;
}

/** Verifica que un argumento no contenga metacaracteres de shell ni rutas absolutas. */
export function isSafeArgument(value: string) {
  return !/[;&|`$<>(){}\[\]!*?~\\\n\r]/.test(value) && !value.startsWith("/") && !value.startsWith("-");
}

export type ImageResult =
  | { ok: true; dataUrl: string; note: string }
  | { ok: false; error: string };

/**
 * Genera una imagen con un modelo de imagen. El modelo de chat no devuelve pixeles.
 */
export async function generateImage(prompt: string, size?: string): Promise<ImageResult> {
  return generateStill(prompt, size);
}
