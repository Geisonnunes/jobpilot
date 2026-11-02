import type { Seniority, WorkMode } from "@/generated/prisma/enums";
import { normalizeForComparison } from "./text";

/**
 * Inferência de senioridade e modalidade quando a fonte não informa.
 * Funções puras: texto entra, valor (ou undefined, se houver dúvida) sai.
 */

/** Ordem crescente; usada também para comparar com a senioridade desejada. */
export const SENIORITY_ORDER: Seniority[] = ["INTERN", "JUNIOR", "MID", "SENIOR", "LEAD"];

// Os textos chegam sem acento e em minúsculas (normalizeForComparison).
const TITLE_RULES: Array<[Seniority, RegExp]> = [
  ["INTERN", /\b(estagi\w*|intern|internship|trainee)\b/],
  ["JUNIOR", /\b(junior|jr|entry[- ]level)\b/],
  ["MID", /\b(pleno|mid|mid[- ]level|intermediate)\b/],
  ["SENIOR", /\b(senior|sr|especialista|specialist)\b/],
  ["LEAD", /\b(lead|lider|staff|principal|head|coordenador\w*|gerente|manager)\b/],
];

// Na descrição só valem rótulos explícitos; "experiência com sêniores" não conta.
const DESCRIPTION_RULES: Array<[Seniority, RegExp]> = [
  ["INTERN", /\bvaga (de|para) estagio\b/],
  ["JUNIOR", /\b(nivel|senioridade|level|vaga|posicao)\s*:?\s*(para\s+)?(junior|jr)\b/],
  ["MID", /\b(nivel|senioridade|level|vaga|posicao)\s*:?\s*(para\s+)?(pleno|mid)\b/],
  ["SENIOR", /\b(nivel|senioridade|level|vaga|posicao)\s*:?\s*(para\s+)?senior\b/],
];

export function inferSeniority(title: string, description = ""): Seniority | undefined {
  const t = normalizeForComparison(title);
  // Em "Júnior/Pleno" vale o menor nível: é o que importa a quem busca vaga júnior.
  for (const [level, re] of TITLE_RULES) if (re.test(t)) return level;
  const d = normalizeForComparison(description);
  for (const [level, re] of DESCRIPTION_RULES) if (re.test(d)) return level;
  return undefined;
}

const HYBRID_RE = /\b(hibrid[oa]s?|hybrid)\b/;
const REMOTE_RE = /\b(remot[oa]s?|remote|home ?office|work from home|trabalho a distancia|anywhere|worldwide)\b/;
const ONSITE_RE = /\b(presencial|on[- ]?site|in[- ]office|in person)\b/;

function modeOf(text: string): WorkMode | undefined {
  // "Híbrido" costuma citar home office, então tem prioridade sobre "remoto".
  if (HYBRID_RE.test(text)) return "HYBRID";
  if (REMOTE_RE.test(text)) return "REMOTE";
  if (ONSITE_RE.test(text)) return "ONSITE";
  return undefined;
}

/** Título e local mandam; a descrição só decide se aqueles forem inconclusivos. */
export function inferWorkMode(title: string, description = "", location = ""): WorkMode | undefined {
  return modeOf(normalizeForComparison(`${title} ${location}`)) ?? modeOf(normalizeForComparison(description));
}
