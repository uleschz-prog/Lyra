// Entrega 2: cómo se sirve un sitio publicado en /s/[slug]. Lógica pura (sin base de datos).
// El HTML lo escribió un modelo: se entrega con CSP «sandbox», así el documento tiene un origen
// opaco aunque viva en el dominio de LYRA (no puede leer cookies ni almacenamiento de LYRA,
// y sus peticiones salen sin credenciales).

export type PublishedMeta = {
  title: string;
  description: string;
  /** URL pública absoluta de la página. */
  url: string;
  indexable: boolean;
  /** Origen de LYRA para el sello «Hecho con LYRA». */
  appUrl: string;
  /** Color para el ícono por defecto. */
  color?: string;
};

function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Ícono por defecto: inicial del sitio sobre un cuadro de color (SVG en data URI). */
export function defaultFavicon(title: string, color = "#7C3AED") {
  const letter = (title.trim().match(/[A-Za-zÁÉÍÓÚÑáéíóúñ0-9]/)?.[0] ?? "L").toUpperCase();
  const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : "#7C3AED";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${safeColor}"/><text x="32" y="43" font-family="system-ui,sans-serif" font-size="34" font-weight="700" text-anchor="middle" fill="#fff">${letter.replace(/[<>&"]/g, "")}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function headExtras(html: string, meta: PublishedMeta) {
  const tags: string[] = [];
  const has = (pattern: RegExp) => pattern.test(html);
  tags.push(`<meta name="robots" content="${meta.indexable ? "index, follow" : "noindex, nofollow"}" />`);
  if (meta.indexable) tags.push(`<link rel="canonical" href="${escapeAttr(meta.url)}" />`);
  if (!has(/<link[^>]+rel=["'](?:shortcut )?icon["']/i)) tags.push(`<link rel="icon" href="${escapeAttr(defaultFavicon(meta.title, meta.color))}" />`);
  if (!has(/<meta[^>]+property=["']og:title["']/i)) {
    tags.push(
      `<meta property="og:type" content="website" />`,
      `<meta property="og:title" content="${escapeAttr(meta.title)}" />`,
      `<meta property="og:description" content="${escapeAttr(meta.description.slice(0, 200))}" />`,
      `<meta property="og:url" content="${escapeAttr(meta.url)}" />`,
      `<meta property="og:locale" content="es_MX" />`,
      `<meta name="twitter:card" content="summary" />`,
    );
  }
  if (!has(/<meta[^>]+name=["']description["']/i) && meta.description) tags.push(`<meta name="description" content="${escapeAttr(meta.description.slice(0, 160))}" />`);
  return tags.join("\n    ");
}

/** Sello pequeño y honesto; enlaza a LYRA en otra pestaña. */
export function madeWithBadge(appUrl: string) {
  const href = `${appUrl.replace(/\/$/, "")}/?ref=sitio`;
  return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener" aria-label="Hecho con LYRA" style="position:fixed;right:12px;bottom:12px;z-index:2147483647;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:rgba(17,16,24,.82);color:#fff;font:600 11px/1 system-ui,-apple-system,'Segoe UI',sans-serif;text-decoration:none;box-shadow:0 6px 20px rgba(0,0,0,.18);backdrop-filter:blur(6px)">✦ Hecho con LYRA</a>`;
}

/**
 * Configuración de datos en vivo para la app (va en <head>, antes del código de la app). Solo
 * datos públicos: la dirección de la Data API y el estado; la sesión la obtiene la app con PIN.
 */
export function liveConfigScript(config: { api: string; slug: string; status: "active" | "paused" }) {
  const json = JSON.stringify(config).replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, "");
  return `<script>window.__LYRA_DATA__=${json};</script>`;
}

/** Inserta metadatos (y `extraHead`) al inicio de <head> y el sello antes de </body>. */
export function publishedPageHtml(html: string, meta: PublishedMeta, extraBody = "", extraHead = "") {
  const head = extraHead ? `${extraHead}\n    ${headExtras(html, meta)}` : headExtras(html, meta);
  const body = `${madeWithBadge(meta.appUrl)}${extraBody}`;
  let out = /<head(?:\s[^>]*)?>/i.test(html) ? html.replace(/<head(?:\s[^>]*)?>/i, (tag) => `${tag}\n    ${head}`) : `<!doctype html><html lang="es-MX"><head>${head}</head><body>${html}</body></html>`;
  out = /<\/body>/i.test(out) ? out.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${body}\n</body>`) : `${out}${body}`;
  return out;
}

/** CSP del sitio publicado. `connect` agrega orígenes exactos (p. ej. el endpoint de contactos). */
export function publishedCsp(connect: string[] = []) {
  return [
    "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals",
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src data: https://fonts.gstatic.com",
    "img-src data: blob: https:",
    "media-src data: blob: https:",
    `connect-src ${connect.length ? connect.join(" ") : "'none'"}`,
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function publishedHeaders(input: { indexable: boolean; connect?: string[] }): Record<string, string> {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": publishedCsp(input.connect),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    // CDN de Vercel: un minuto en caché y hasta 5 min sirviendo la copia anterior mientras se renueva.
    "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    ...(input.indexable ? {} : { "X-Robots-Tag": "noindex, nofollow" }),
  };
}

export function notPublishedHtml(appUrl: string) {
  return `<!doctype html><html lang="es-MX"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex" /><title>Sitio no disponible</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;background:#F4F3F0;color:#1E1E24"><main style="text-align:center;padding:24px"><h1 style="font-size:22px;margin:0 0 8px">Este sitio no está publicado</h1><p style="margin:0;color:#5C5854">Puede que la dirección esté mal escrita o que su dueño lo haya despublicado.</p><p style="margin-top:20px"><a href="${escapeAttr(appUrl)}" style="color:#7C3AED">Ir a LYRA</a></p></main></body></html>`;
}
