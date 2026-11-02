/**
 * HTML → texto puro seguro.
 *
 * Adaptado de providers/_html-to-text.mjs e _html-entities.mjs do Career Ops.
 * Copyright (c) 2026 Santiago Fernández de Valderrama — MIT License.
 * Veja THIRD_PARTY_NOTICES.md.
 *
 * As fontes devolvem HTML. Aqui ele vira texto: sem tags, preservando parágrafos
 * e listas. O resultado nunca deve ser renderizado como HTML.
 */

export const DESCRIPTION_MAX_CHARS = 20_000;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  agrave: "à", aacute: "á", acirc: "â", atilde: "ã", auml: "ä", aring: "å", ccedil: "ç",
  egrave: "è", eacute: "é", ecirc: "ê", euml: "ë", igrave: "ì", iacute: "í", icirc: "î", iuml: "ï",
  ntilde: "ñ", ograve: "ò", oacute: "ó", ocirc: "ô", otilde: "õ", ouml: "ö", oslash: "ø",
  ugrave: "ù", uacute: "ú", ucirc: "û", uuml: "ü", yacute: "ý", yuml: "ÿ", szlig: "ß",
  Agrave: "À", Aacute: "Á", Acirc: "Â", Atilde: "Ã", Auml: "Ä", Aring: "Å", Ccedil: "Ç",
  Egrave: "È", Eacute: "É", Ecirc: "Ê", Euml: "Ë", Igrave: "Ì", Iacute: "Í", Icirc: "Î", Iuml: "Ï",
  Ntilde: "Ñ", Ograve: "Ò", Oacute: "Ó", Ocirc: "Ô", Otilde: "Õ", Ouml: "Ö",
  Ugrave: "Ù", Uacute: "Ú", Ucirc: "Û", Uuml: "Ü",
  ndash: "–", mdash: "—", hellip: "…", bull: "•", middot: "·", laquo: "«", raquo: "»",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", copy: "©", reg: "®", trade: "™", euro: "€",
  ordm: "º", ordf: "ª", deg: "°", times: "×",
};

/** Pontos de código que podem ser emitidos: sem controles, substitutos ou fora do Unicode. */
function isEmittable(cp: number): boolean {
  if (!Number.isInteger(cp) || cp < 0 || cp > 0x10ffff) return false;
  if (cp === 9 || cp === 10 || cp === 13) return true;
  if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) return false;
  if (cp >= 0xd800 && cp <= 0xdfff) return false;
  return cp !== 0xfffe && cp !== 0xffff;
}

export function decodeEntities(input: string): string {
  return input.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z][a-z0-9]*));/gi, (match, hex, dec, name) => {
    if (hex !== undefined || dec !== undefined) {
      const cp = hex !== undefined ? parseInt(hex, 16) : parseInt(dec, 10);
      return isEmittable(cp) ? String.fromCodePoint(cp) : "";
    }
    return Object.hasOwn(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : match;
  });
}

// Uma tag começa com `<` seguido de letra, `/`, `!` ou `?`; assim "equipes de <10 pessoas" não vira tag.
// Valores de atributo podem conter `>`, então são consumidos entre aspas.
const TAG_RE = /<(?=[a-z/!?])(?:[^>"']|"[^"]*"|'[^']*')+>/gi;
const COMMENT_RE = /<!--[\s\S]*?-->/g;
const DANGEROUS_BLOCK_RE = /<(script|style|template|iframe|object|embed|svg|noscript)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>/gi;

/** Troca tags de bloco por quebras de linha e itens de lista por "- ", depois remove o resto. */
function stripMarkup(html: string): string {
  return html
    .replace(COMMENT_RE, " ")
    .replace(DANGEROUS_BLOCK_RE, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|header|footer|h[1-6]|ul|ol|table|blockquote|pre)\s*>/gi, "\n\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/tr\s*>/gi, "\n")
    .replace(/<\/li\s*>/gi, "")
    .replace(/<\/(td|th)\s*>/gi, " ")
    .replace(/<(p|div|section|article|h[1-6]|ul|ol|table|tr|blockquote|pre)\b[^>]*>/gi, "\n")
    // Tags inline (<b>, <a>, <span>) somem sem deixar espaço: "<b>Empresa</b>." vira "Empresa.".
    .replace(TAG_RE, "");
}

function tidyWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ​]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Converte HTML (ou texto) em texto puro. Decodifica entidades duas vezes, porque
 * algumas fontes enviam tags escapadas (`&lt;p&gt;`).
 */
export function htmlToText(input: unknown, maxChars: number = DESCRIPTION_MAX_CHARS): string {
  if (typeof input !== "string" || !input) return "";
  // Tags literais saem ANTES de decodificar: aspas em atributos são dados, não delimitadores.
  let text = decodeEntities(stripMarkup(input));
  text = decodeEntities(stripMarkup(text));
  text = stripMarkup(text)
    // Um "<" de tag incompleta no fim não tem ">" para consumir: remove só o sinal, deixando o texto inerte.
    .replace(/<(?=\/?[a-z!?])/gi, "");
  return tidyWhitespace(text).slice(0, maxChars);
}

/** Forma usada para comparar textos: sem HTML, minúsculas, sem acentos e com espaços colapsados. */
export function normalizeForComparison(input: unknown): string {
  return htmlToText(input, Infinity)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
