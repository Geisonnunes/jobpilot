/**
 * Conector do Remotive (feed público de vagas remotas).
 *
 * Portado e adaptado para TypeScript de providers/remotive.mjs (Career Ops).
 * Copyright (c) 2026 Santiago Fernández de Valderrama — MIT License.
 * Veja THIRD_PARTY_NOTICES.md.
 *
 * Regras de uso da API (README oficial de remotive-com/remote-jobs-api):
 * - no máximo ~4 consultas por dia; mais de 2 por minuto é bloqueado;
 * - as vagas chegam com 24 h de atraso;
 * - é obrigatório linkar para a URL do Remotive e citá-lo como fonte;
 * - proibido reenviar as vagas a terceiros ou usá-las para captar cadastros.
 * Por isso: UMA requisição por coleta (feed completo) e filtro local.
 */
import type { WorkMode } from "@/generated/prisma/enums";
import { fetchJson } from "./http";
import type { ConnectorContext, ConnectorQuery, JobConnector, NormalizedJob } from "./types";

// Sem filtro de categoria: na coleta real o parâmetro category=software-dev foi ignorado (vieram vagas de
// vendas e redação) e o feed inteiro tinha só 12 vagas. O filtro por palavra-chave é local.
const FEED_URL = "https://remotive.com/api/remote-jobs";
const FEED_HOST = "remotive.com";

type RawRemotiveJob = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Remove acentos, põe em minúsculas e junta "front-end"/"front end" em "frontend". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/front[\s-]+end/g, "frontend")
    .replace(/back[\s-]+end/g, "backend")
    .replace(/full[\s-]+stack/g, "fullstack");
}

/** Palavras genéricas de cargo: sozinhas não identificam uma área. */
const GENERIC_TERMS = new Set([
  "desenvolvedor", "desenvolvedora", "developer", "dev", "engenheiro", "engenheira", "engineer",
  "programador", "programadora", "analista", "de", "da", "do", "e", "the", "and", "junior", "jr",
]);

/** Termos distintivos das palavras-chave do perfil (ex.: "Desenvolvedor Front-end" → "frontend"). */
export function buildKeywordTerms(keywords: string[]): string[] {
  const terms = new Set<string>();
  for (const keyword of keywords) {
    for (const word of fold(keyword).split(/\s+/)) {
      const w = word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
      if (w.length >= 2 && !GENERIC_TERMS.has(w)) terms.add(w);
    }
  }
  return [...terms];
}

/**
 * A vaga casa se algum termo aparece no título. As tags só valem para vagas de software:
 * nos dados reais elas são ruidosas (um "Remote Office Assistant" vem com a tag "frontend").
 */
export function matchesKeywords(job: NormalizedJob, terms: string[], category = ""): boolean {
  if (terms.length === 0) return true;
  const softwareCategory = /software|development|desenvolvimento|engineering/.test(fold(category));
  const haystack = fold(`${job.title} ${softwareCategory ? (job.tags ?? []).join(" ") : ""}`);
  return terms.some((t) => new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(haystack));
}

/** Para candidatos no Brasil: aceita vagas sem restrição de local ou abertas à região. */
export function isLocationEligible(location: string | undefined, country: string | undefined): boolean {
  if (!country || country.toUpperCase() !== "BR") return true;
  const l = fold(location ?? "");
  if (!l) return true;
  return /worldwide|anywhere|global|brazil|brasil|latam|latin america|south america|americas|\bamerica\b/.test(l);
}

export function extractRemotiveRows(json: unknown): RawRemotiveJob[] {
  const rows = json && typeof json === "object" ? (json as { jobs?: unknown }).jobs : undefined;
  if (!Array.isArray(rows)) {
    const keys = json && typeof json === "object" ? Object.keys(json).join(", ") : String(json);
    throw new Error(`Remotive: resposta inesperada: esperado { jobs: [...] }, recebido [${keys}]`);
  }
  return rows as RawRemotiveJob[];
}

/** Só aceita http(s) em remotive.com para o link de origem (a atribuição exige o link do Remotive). */
function isRemotiveUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return (u.protocol === "https:" || u.protocol === "http:") && (u.hostname === FEED_HOST || u.hostname.endsWith(`.${FEED_HOST}`));
  } catch {
    return false;
  }
}

const EMPLOYMENT: Record<string, string> = {
  full_time: "Tempo integral",
  part_time: "Meio período",
  contract: "Contrato",
  freelance: "Freelance",
  internship: "Estágio",
};

export function normalizeRemotiveJob(j: unknown): NormalizedJob | null {
  if (!j || typeof j !== "object") return null;
  const raw = j as RawRemotiveJob;
  const title = str(raw.title);
  const url = str(raw.url);
  if (!title || !isRemotiveUrl(url)) return null;

  // O Remotive manda a data sem fuso ("2026-10-29T18:22:41"); sem o "Z" o Node leria como horário local.
  const rawDate = typeof raw.publication_date === "string" ? raw.publication_date.trim() : "";
  const published = rawDate ? Date.parse(/(Z|[+-]\d{2}:?\d{2})$/.test(rawDate) ? rawDate : `${rawDate}Z`) : NaN;
  const location = str(raw.candidate_required_location);
  const type = str(raw.job_type);
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string" && t.trim() !== "").map((t) => t.trim()) : [];

  const job: NormalizedJob = {
    url,
    title,
    company: str(raw.company_name) || "Empresa não informada",
    description: typeof raw.description === "string" ? raw.description : "",
    workMode: "REMOTE" as WorkMode,
  };
  if (raw.id !== undefined && raw.id !== null && String(raw.id).trim()) job.externalId = String(raw.id).trim();
  if (location) job.location = location;
  if (type) job.employmentType = EMPLOYMENT[type] ?? type;
  if (tags.length > 0) job.tags = tags;
  if (!Number.isNaN(published)) job.publishedAt = new Date(published);
  return job;
}

async function search(query: ConnectorQuery, ctx: ConnectorContext): Promise<NormalizedJob[]> {
  // Uma única requisição por coleta (limite de uso da API).
  const rows = extractRemotiveRows(await fetchJson(ctx, FEED_URL));
  const terms = buildKeywordTerms(query.keywords);
  const cutoff = query.since?.getTime();
  const max = query.maxResults ?? 200;

  const seen = new Set<string>();
  const out: NormalizedJob[] = [];
  for (const raw of rows as RawRemotiveJob[]) {
    const job = normalizeRemotiveJob(raw);
    if (!job || seen.has(job.url)) continue;
    seen.add(job.url);
    if (query.workModes?.length && !query.workModes.includes("REMOTE")) continue; // só vagas remotas
    if (!isLocationEligible(job.location, query.country)) continue;
    if (cutoff !== undefined && job.publishedAt && job.publishedAt.getTime() < cutoff) continue;
    if (!matchesKeywords(job, terms, str((raw as RawRemotiveJob).category))) continue;
    out.push(job);
    if (out.length >= max) break;
  }
  return out;
}

export const remotiveConnector: JobConnector = {
  slug: "remotive",
  allowedHosts: [FEED_HOST],
  search,
};
