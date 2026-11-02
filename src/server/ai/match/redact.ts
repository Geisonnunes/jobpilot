/**
 * Remove dados pessoais do texto do CV antes de enviá-lo à IA (função pura).
 * Cobre: e-mails, CPF, CEP, telefones, links (LinkedIn, GitHub, portfólio…), linhas de endereço
 * e, opcionalmente, o nome da pessoa. Não é infalível: é uma camada a mais, não a única.
 */

export interface RedactOptions {
  /** Nomes a remover (ex.: nome completo e primeiro nome do usuário). */
  names?: string[];
}

export interface RedactResult {
  text: string;
  counts: { emails: number; cpfs: number; phones: number; links: number; addresses: number; names: number };
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_WITH_SCHEME = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
// Sem esquema: domínios de perfis conhecidos e qualquer "dominio.tld/caminho".
const URL_BARE = /\b(?:[a-z0-9-]+\.)*(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|dribbble\.com|medium\.com|bit\.ly|notion\.site|vercel\.app|netlify\.app|github\.io)(?:\/[^\s<>"')\]]*)?/gi;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CEP = /\b\d{5}-\d{3}\b/g;
// Com DDD (e opcionalmente +55): (11) 91234-5678, 11 91234 5678, +55 11 91234-5678.
const PHONE_DDD = /(?:\+?55[\s.-]?)?\(?\b\d{2}\)?[\s.-]?9?\d{4}[-.\s]?\d{4}\b/g;
// Sem DDD, com hífen: 91234-5678 / 3456-7890 (intervalos de anos como 2021-2023 ficam de fora).
const PHONE_LOCAL = /\b9?\d{4}-\d{4}\b/g;
const ADDRESS_LINE = /^[^\S\n]*(?:endere[cç]o|rua|r\.|avenida|av\.|alameda|travessa|estrada|rodovia|praça|praca|largo|quadra|bairro)\b.*$/gim;

const YEAR_RANGE = /^(?:19|20)\d{2}-(?:19|20)\d{2}$/;

function replaceCounting(text: string, pattern: RegExp, replacement: string, onCount: (n: number) => void, keep?: (m: string) => boolean): string {
  let n = 0;
  const out = text.replace(pattern, (match) => {
    if (keep?.(match)) return match;
    n += 1;
    return replacement;
  });
  onCount(n);
  return out;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactPii(input: string, options: RedactOptions = {}): RedactResult {
  const counts = { emails: 0, cpfs: 0, phones: 0, links: 0, addresses: 0, names: 0 };
  let text = input;

  // E-mails antes de links (o domínio do e-mail não deve virar "link").
  text = replaceCounting(text, EMAIL, "[e-mail removido]", (n) => (counts.emails += n));
  text = replaceCounting(text, URL_WITH_SCHEME, "[link removido]", (n) => (counts.links += n));
  text = replaceCounting(text, URL_BARE, "[link removido]", (n) => (counts.links += n));
  text = replaceCounting(text, CPF, "[CPF removido]", (n) => (counts.cpfs += n));
  text = replaceCounting(text, CEP, "[CEP removido]", (n) => (counts.addresses += n));
  text = replaceCounting(text, ADDRESS_LINE, "[endereço removido]", (n) => (counts.addresses += n));
  text = replaceCounting(text, PHONE_DDD, "[telefone removido]", (n) => (counts.phones += n), (m) => YEAR_RANGE.test(m.trim()));
  text = replaceCounting(text, PHONE_LOCAL, "[telefone removido]", (n) => (counts.phones += n), (m) => YEAR_RANGE.test(m));

  for (const raw of options.names ?? []) {
    const name = raw.trim();
    if (name.length < 3) continue;
    text = replaceCounting(text, new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"), "[nome]", (n) => (counts.names += n));
  }

  return { text, counts };
}
