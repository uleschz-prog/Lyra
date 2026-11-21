/**
 * Etiqueta de ánimo heredada («[animo: feliz]»). Vega ya no la pide en el prompt, pero los
 * historiales viejos y el modelo pueden traerla: nunca debe llegar al socio, ni partida
 * entre dos fragmentos del stream ni con negritas alrededor.
 */
const tagPattern = /\*{0,2}\[\s*[aá]nimo\s*:\s*[^\]\n]{0,40}\]\*{0,2}[ \t]*\n?/gi;
/** Un posible inicio de etiqueta que todavía no se cierra (al final de lo recibido). */
const partialPattern = /\*{0,2}\[\s*(?:[aá](?:n(?:i(?:m(?:o(?:\s*(?::[^\]\n]{0,40})?)?)?)?)?)?)?$/i;

export function stripMoodTags(text: string) {
  return text.replace(tagPattern, "");
}

/** Filtro para texto en streaming: retiene solo lo que podría ser el inicio de una etiqueta. */
export function createMoodFilter() {
  let held = "";
  /** La última etiqueta quitada cerraba lo recibido: el espacio que sigue también sobra. */
  let afterTag = false;
  return {
    push(chunk: string) {
      const raw = held + chunk;
      let text = stripMoodTags(afterTag ? raw.replace(/^[ \t]+/, "") : raw);
      if (afterTag && text) afterTag = false;
      if (/\][*]{0,2}[ \t]*\n?$/.test(raw) && text.length < raw.length && !text.endsWith("]")) {
        afterTag = true;
        text = text.replace(/[ \t]+$/, (space) => (text.trim() ? space.slice(0, 1) : ""));
      }
      const partial = text.match(partialPattern);
      if (partial && partial.index !== undefined && text.length - partial.index <= 60) {
        held = text.slice(partial.index);
        return text.slice(0, partial.index);
      }
      held = "";
      return text;
    },
    /** Fin del mensaje: lo retenido no era etiqueta. */
    end() {
      const rest = stripMoodTags(held);
      held = "";
      return rest;
    },
  };
}
