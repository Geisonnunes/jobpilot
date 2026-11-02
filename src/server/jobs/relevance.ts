import type { Seniority } from "@/generated/prisma/enums";
import { normalizeForComparison } from "./text";

/**
 * Relevância de uma vaga para quem procura front-end (função pura, só título + trecho da descrição).
 * Usada na coleta (vagas irrelevantes ou acima do nível nem são salvas) e na limpeza das vagas antigas.
 *
 * Todos os termos ficam nas constantes abaixo, fáceis de ajustar. Os textos chegam sem acento e em
 * minúsculas; hífens, pontos e barras viram espaço ("Front-end" → "front end", "Next.js" → "next js").
 */

export type RelevanceCategory = "RELEVANT" | "FULLSTACK" | "IRRELEVANT" | "SENIORITY_ABOVE";

export interface RelevanceResult {
  category: RelevanceCategory;
  /** false = não salvar. */
  keep: boolean;
  reason: string;
}

export interface RelevanceProfile {
  seniority: Seniority;
}

export interface RelevanceJob {
  title: string;
  description?: string;
}

// ───────── Termos (ajuste aqui) ─────────

/** Sinais de front-end/web/UI no título. "react native" é removido antes (é mobile). */
export const FRONTEND_TERMS = [
  "front end", "frontend", "front", "react", "next js", "nextjs", "vue", "vuejs", "nuxt", "angular", "svelte",
  "javascript", "typescript", "html", "css", "design system", "web", "ui", "interface", "interfaces",
  "jquery", "redux", "tailwind",
];

/** Tecnologias de front-end procuradas no trecho da descrição (quando o título não diz). */
export const FRONTEND_DESCRIPTION_TERMS = [
  "react", "next js", "nextjs", "vue", "angular", "svelte", "javascript", "typescript", "html", "css", "front end", "frontend",
];

export const FULLSTACK_TERMS = ["full stack", "fullstack"];

/** Só valem quando o título NÃO tem sinal de front-end nem de full-stack. */
export const IRRELEVANT_AREAS: Record<string, string[]> = {
  "mobile nativo": ["android", "ios", "kotlin", "swift", "flutter", "mobile", "react native", "rn mobile"],
  "back-end": [
    "back end", "backend", "java", "c#", "csharp", "dotnet", "net core", "python", "php", "golang", "go lang", "ruby", "rails",
    "node", "nodejs", "spring", "scala", "rust", "elixir",
  ],
  "infra/DevOps": ["devops", "sre", "infra", "infraestrutura", "cloud", "redes", "sysadmin", "dba", "seguranca da informacao", "cybersecurity", "site reliability", "platform engineer"],
  "QA": ["qa", "quality assurance", "teste", "testes", "tester", "sdet", "qualidade"],
  "dados": ["dados", "data", "analytics", "bi", "power bi", "machine learning", "inteligencia artificial", "cientista"],
  "outra área": [
    "vendas", "vendedor", "vendedora", "comercial", "administrativo", "administrativa", "auxiliar", "assistente", "recepcionista",
    "rh", "recursos humanos", "recrutador", "recrutadora", "contabil", "contador", "contadora", "financeiro", "financeira", "fiscal",
    "marketing", "atendimento", "suporte", "motorista", "logistica", "operador", "operadora", "enfermeiro", "enfermeira", "medico",
    "professor", "professora", "juridico", "advogado", "advogada", "ux", "designer", "design",
  ],
};

/** Marcadores de nível júnior/estágio: se aparecerem, o nível é júnior ("Pleno/Júnior" não é descartada). */
const JUNIOR_TOKENS = ["junior", "jr"];
const INTERN_TOKENS = ["estagio", "estagiario", "estagiaria", "trainee", "aprendiz"];
const LEAD_TOKENS = ["lead", "lider", "coordenador", "coordenadora", "gerente", "manager", "head", "staff", "principal", "diretor", "diretora"];
const SENIOR_TOKENS = ["senior", "especialista", "specialist", "architect", "arquiteto", "arquiteta"];
const MID_TOKENS = ["pleno", "mid", "middle", "intermediario"];
/** "Sr", "Pl" e algarismos romanos só contam colados a uma palavra de cargo/tecnologia (veja detectTitleLevel). */
const AMBIGUOUS_SENIOR = ["sr"];
const AMBIGUOUS_MID = ["pl"];
const ROMAN_MID = ["ii"];
const ROMAN_SENIOR = ["iii", "iv"];

/** Palavras que "ancoram" Sr/Pl/II/III: vêm junto de cargo ou tecnologia. */
const ROLE_WORDS = new Set([
  "desenvolvedor", "desenvolvedora", "developer", "dev", "engineer", "engenheiro", "engenheira", "analista", "programador",
  "programadora", "software", "front", "end", "frontend", "backend", "back", "full", "stack", "fullstack", "react", "angular",
  "vue", "next", "node", "java", "mobile", "web", "ui", "ti", "pessoa", "tecnologia", "sistemas", "js", "ts", "javascript",
  "typescript", "nextjs", "net", "python", "native", "pl", "sr", "jr",
]);

/** Frases que parecem nível mas não são (nome de empresa, "PL/SQL"): removidas antes de procurar nível. */
const COMPANY_FALSE_POSITIVES = [/\bsenior sistemas\b/g, /\bpl sql\b/g];

// ───────── Utilidades ─────────

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const termRe = (terms: string[]) => new RegExp(`(?:^|\\s)(?:${terms.map(escapeRe).join("|")})(?=\\s|$)`);
const FRONT_RE = termRe(FRONTEND_TERMS);
const FRONT_DESC_RE = termRe(FRONTEND_DESCRIPTION_TERMS);
const FULLSTACK_RE = termRe(FULLSTACK_TERMS);
const BACKEND_EXPLICIT_RE = termRe(["back end", "backend"]);
const EXPLICIT_FRONT_RE = termRe(["front end", "frontend", "front"]);
const AREA_RES = Object.entries(IRRELEVANT_AREAS).map(([area, terms]) => [area, termRe(terms)] as const);

/** Minúsculas, sem acento; tudo que não é letra/número vira espaço. */
function flat(text: string): string {
  return normalizeForComparison(text).replace(/[^a-z0-9#]+/g, " ").trim();
}

/** Segmentos do título separados por " - ", " | ", " / ", parênteses etc. (não separa "Front-end"). */
function segmentsOf(title: string): string[] {
  return normalizeForComparison(title)
    .split(/\s[-–—|/]\s|[()[\]:,;]/)
    .map(flat)
    .filter(Boolean);
}

const RANK: Record<Seniority, number> = { INTERN: 0, JUNIOR: 1, MID: 2, SENIOR: 3, LEAD: 4 };

/**
 * Nível indicado pelo título, ou undefined. Marcador júnior/estágio vence qualquer outro.
 * "Sr", "Pl", "II" e "III" só valem quando colados a palavras de cargo (ou sozinhos num segmento),
 * então "Sr." no nome de uma empresa não conta.
 */
export function detectTitleLevel(title: string): Seniority | undefined {
  let best: Seniority | undefined;
  const bump = (level: Seniority) => {
    if (best === undefined || RANK[level] > RANK[best]) best = level;
  };

  for (let segment of segmentsOf(title)) {
    for (const re of COMPANY_FALSE_POSITIVES) segment = segment.replace(re, " ");
    const tokens = segment.split(" ").filter(Boolean);
    const anchored = (i: number) => tokens.length === 1 || ROLE_WORDS.has(tokens[i - 1] ?? "") || ROLE_WORDS.has(tokens[i + 1] ?? "");

    tokens.forEach((t, i) => {
      if (INTERN_TOKENS.includes(t)) bump("INTERN");
      else if (JUNIOR_TOKENS.includes(t)) bump("JUNIOR");
      else if (LEAD_TOKENS.includes(t)) bump("LEAD");
      else if (SENIOR_TOKENS.includes(t)) bump("SENIOR");
      else if (MID_TOKENS.includes(t)) bump("MID");
      else if (AMBIGUOUS_SENIOR.includes(t) && anchored(i)) bump("SENIOR");
      else if (AMBIGUOUS_MID.includes(t) && anchored(i)) bump("MID");
      else if (ROMAN_MID.includes(t) && anchored(i)) bump("MID");
      else if (ROMAN_SENIOR.includes(t) && anchored(i)) bump("SENIOR");
    });
  }

  // "Pleno/Júnior", "Júnior/Pleno": a vaga aceita júnior.
  const all = segmentsOf(title).join(" ").split(" ");
  if (all.some((t) => JUNIOR_TOKENS.includes(t))) return "JUNIOR";
  if (all.some((t) => INTERN_TOKENS.includes(t))) return "INTERN";
  return best;
}

const DESCRIPTION_SNIPPET_CHARS = 1500;

function titleSignals(title: string) {
  // "React Native" é mobile: sai antes de procurar "react".
  const text = flat(title).replace(/\breact native\b/g, "rn mobile");
  return { text, front: FRONT_RE.test(` ${text}`), fullstack: FULLSTACK_RE.test(` ${text}`) };
}

/** Classifica a vaga. Ordem: relevância da área primeiro, depois o nível (para os contadores fazerem sentido). */
export function classifyRelevance(job: RelevanceJob, profile: RelevanceProfile): RelevanceResult {
  const { text, front, fullstack } = titleSignals(job.title);
  const snippet = flat((job.description ?? "").slice(0, DESCRIPTION_SNIPPET_CHARS));
  const descriptionHasFront = FRONT_DESC_RE.test(` ${snippet}`);

  // "Backend (.Net/React)": back-end declarado e nada de front-end/full-stack declarado → back-end puro.
  if (BACKEND_EXPLICIT_RE.test(` ${text}`) && !EXPLICIT_FRONT_RE.test(` ${text}`) && !fullstack) {
    return { category: "IRRELEVANT", keep: false, reason: "Outra área (back-end)." };
  }

  let category: "RELEVANT" | "FULLSTACK";
  if (front && !fullstack) {
    category = "RELEVANT";
  } else if (fullstack) {
    // Full-stack só interessa com front-end: no título ou no começo da descrição.
    if (!front && !descriptionHasFront) {
      return { category: "IRRELEVANT", keep: false, reason: "Full-stack sem front-end relevante." };
    }
    category = "FULLSTACK";
  } else {
    const area = AREA_RES.find(([, re]) => re.test(` ${text}`));
    if (area) return { category: "IRRELEVANT", keep: false, reason: `Outra área (${area[0]}).` };
    if (!descriptionHasFront) return { category: "IRRELEVANT", keep: false, reason: "Sem sinal de front-end no título nem na descrição." };
    category = "RELEVANT";
  }

  const level = detectTitleLevel(job.title);
  const limit = Math.max(RANK[profile.seniority], RANK.JUNIOR); // júnior nunca é descartado
  if (level && RANK[level] > limit) {
    return { category: "SENIORITY_ABOVE", keep: false, reason: `Nível acima do desejado (${level.toLowerCase()}).` };
  }
  return { category, keep: true, reason: category === "FULLSTACK" ? "Full-stack com front-end." : "Front-end/web." };
}

export const isRelevant = (job: RelevanceJob, profile: RelevanceProfile) => classifyRelevance(job, profile).keep;

// ───────── Filtro de coleta ─────────

export interface RelevanceStats {
  fetched: number;
  kept: number;
  relevant: number;
  fullstack: number;
  discardedIrrelevant: number;
  discardedSeniority: number;
  /** Por palavra-chave da busca: quantas vagas trouxe e quantas foram mantidas. */
  byKeyword: Record<string, { fetched: number; kept: number }>;
}

/** Separa as vagas que valem ser salvas; devolve também as estatísticas da coleta (guardadas em ScanRun.query.stats). */
export function filterByRelevance<T extends RelevanceJob & { sourceKeyword?: string }>(
  jobs: T[],
  profile: RelevanceProfile,
): { kept: T[]; stats: RelevanceStats } {
  const stats: RelevanceStats = { fetched: jobs.length, kept: 0, relevant: 0, fullstack: 0, discardedIrrelevant: 0, discardedSeniority: 0, byKeyword: {} };
  const kept: T[] = [];
  for (const job of jobs) {
    const result = classifyRelevance(job, profile);
    const kw = (stats.byKeyword[job.sourceKeyword ?? "(sem termo)"] ??= { fetched: 0, kept: 0 });
    kw.fetched++;
    if (result.keep) {
      kept.push(job);
      kw.kept++;
      stats.kept++;
      if (result.category === "FULLSTACK") stats.fullstack++;
      else stats.relevant++;
    } else if (result.category === "SENIORITY_ABOVE") stats.discardedSeniority++;
    else stats.discardedIrrelevant++;
  }
  return { kept, stats };
}
