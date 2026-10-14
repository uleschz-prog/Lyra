export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function printableDocument(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Georgia,serif;color:#1E1E24;margin:2rem}h1{font-size:1.4rem}@media print{body{margin:.5in}}</style></head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`;
}
