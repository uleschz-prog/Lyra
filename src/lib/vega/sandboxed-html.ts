/**
 * Respuesta HTML aislada para piezas creadas por Vega (o por socios).
 * `Content-Security-Policy: sandbox` le da al documento un origen opaco aunque se sirva
 * desde el dominio de LYRA: sus scripts no pueden leer cookies, almacenamiento ni la sesión,
 * ni hacer peticiones a la API con las credenciales del socio.
 */
export const sandboxedHtmlCsp = [
  "sandbox allow-scripts allow-forms allow-modals",
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob: https:",
  "media-src data: blob: https:",
  "font-src data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join("; ");

export function sandboxedHtmlHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": sandboxedHtmlCsp,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "private, no-store",
    "Cross-Origin-Opener-Policy": "same-origin",
    "X-Robots-Tag": "noindex, nofollow",
  };
}

export function sandboxedHtmlResponse(html: string, status = 200) {
  return new Response(html, { status, headers: sandboxedHtmlHeaders() });
}
