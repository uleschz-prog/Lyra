/**
 * Filtro de datos sensibles para la memoria, los archivos y los resúmenes de Vega.
 * Nunca guardamos números de tarjeta, contraseñas, llaves de API ni llaves privadas.
 */

export type SecretKind = "tarjeta" | "contraseña" | "llave" | "cuenta bancaria" | "código de seguridad";

function luhn(digits: string) {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = digits.charCodeAt(index) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Secuencias de 15 a 19 dígitos (con espacios o guiones) que empiezan como una
 * tarjeta (3 Amex, 4 Visa, 5 Mastercard/Carnet, 6 Discover) y pasan Luhn.
 * Así no confundimos teléfonos (+52 1 …, 13 dígitos) con tarjetas.
 */
const cardCandidate = /(?<![\d])[3-6](?:[ -]?\d){14,18}(?![\d])/g;

const patterns: { kind: SecretKind; regex: RegExp }[] = [
  { kind: "llave", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    kind: "llave",
    regex:
      /\b(?:sk-(?:or-|proj-|ant-)?[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|sk_live_[A-Za-z0-9]{16,}|rk_live_[A-Za-z0-9]{16,}|APP_USR-[0-9a-f-]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/,
  },
  {
    kind: "contraseña",
    regex: /\b(?:contrase(?:ñ|n)a|password|passwd|pwd|clave de acceso|clave secreta|pin|nip)\b\s*(?:es|era|:|=)\s*\S{3,}/i,
  },
  { kind: "llave", regex: /\b(?:api[ _-]?key|token|secret|secreto)\b\s*(?:es|:|=)\s*[A-Za-z0-9_\-.]{12,}/i },
  { kind: "código de seguridad", regex: /\b(?:cvv|cvc|c[oó]digo de seguridad)\b\s*(?:es|:|=)?\s*\d{3,4}\b/i },
  // CLABE interbancaria (18 dígitos) o IBAN.
  { kind: "cuenta bancaria", regex: /\bclabe\b\D{0,20}\d{18}\b/i },
  { kind: "cuenta bancaria", regex: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}\b/ },
];

function cardNumbers(text: string) {
  const found: string[] = [];
  for (const match of text.matchAll(cardCandidate)) {
    const digits = match[0].replace(/[ -]/g, "");
    if (digits.length >= 15 && digits.length <= 19 && luhn(digits)) found.push(match[0]);
  }
  return found;
}

/** Devuelve el tipo de dato sensible que encuentra, o null si el texto es seguro. */
export function findSecret(text: string): SecretKind | null {
  if (cardNumbers(text).length) return "tarjeta";
  for (const { kind, regex } of patterns) if (regex.test(text)) return kind;
  return null;
}

export function secretError(kind: SecretKind) {
  return `No guardo datos sensibles (${kind}). Guárdalo en un lugar seguro, no en Vega.`;
}

/** Reemplaza los datos sensibles por [dato oculto]; útil para resúmenes. */
export function redactSecrets(text: string) {
  let clean = text;
  for (const card of cardNumbers(clean)) clean = clean.split(card).join("[dato oculto]");
  for (const { regex } of patterns) clean = clean.replace(new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`), "[dato oculto]");
  return clean;
}
