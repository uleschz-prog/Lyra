/** Lo que cabe en una petición del chat sin pasar el límite de la plataforma. */
export const attachmentLimits = {
  files: 12,
  links: 8,
  fileBytes: 1_200_000,
  totalBytes: 3_200_000,
  excerptChars: 8_000,
  notesChars: 24_000,
} as const;

export const attachmentAccept =
  "image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,text/csv,text/markdown,text/html,application/json,.txt,.md,.csv,.json,.html,.pdf,.docx,.xlsx";
