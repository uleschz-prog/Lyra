import type { NextConfig } from "next";

// PR C: el generador v2 compila en el servidor con esbuild + Tailwind. Estas rutas necesitan
// el binario de esbuild y los paquetes que el proyecto generado puede importar.
const builderFiles = [
  "./node_modules/esbuild/**/*",
  "./node_modules/@esbuild/linux-x64/**/*",
  "./node_modules/react/**/*",
  "./node_modules/react-dom/**/*",
  "./node_modules/scheduler/**/*",
  "./node_modules/lucide-react/package.json",
  "./node_modules/lucide-react/dist/esm/**/*",
  "./node_modules/tailwindcss/package.json",
  "./node_modules/tailwindcss/index.css",
  "./node_modules/tailwindcss/theme.css",
  "./node_modules/tailwindcss/preflight.css",
  "./node_modules/tailwindcss/utilities.css",
  "./node_modules/tailwindcss/dist/**/*",
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  serverExternalPackages: ["esbuild"],
  outputFileTracingIncludes: {
    // Las llaves son globs: «[id]» se escribe con comodín.
    "/api/proyectos/builds/*": builderFiles,
    "/api/vega/routines/dispatch": builderFiles,
    "/api/vega/tasks/run": builderFiles,
  },
};

export default nextConfig;
