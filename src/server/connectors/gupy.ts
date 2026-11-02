/**
 * Conector da Gupy (feed público do portal.gupy.io).
 *
 * Portado e adaptado para TypeScript de providers/gupy.mjs (Career Ops).
 * Copyright (c) 2026 Santiago Fernández de Valderrama — MIT License.
 * Veja THIRD_PARTY_NOTICES.md.
 *
 * Notas de uso (do original, verificadas em 2026-10-07):
 * - Endpoint público, sem autenticação: GET https://portal.gupy.io/api/job-search/jobs
 * - Vagas são anúncios das próprias empresas, em páginas <empresa>.gupy.io.
 *   Vagas "Confidencial" não identificam a empresa e são descartadas.
 * - robots.txt do portal: `User-agent: *` / `Disallow:` (tudo permitido).
 * - `limit` vai até 100; `offset` acima de 9.900 dá 400.
 * - `pagination.total` NÃO serve como critério de parada (devolve o tamanho da página):
 *   uma página curta é o único sinal de fim do feed.
 * - O feed vem ordenado por publishedDate decrescente, inclusive entre páginas.
 * - Não há filtro de país; a Gupy é uma plataforma brasileira.
 */
import type { WorkMode } from "@/generated/prisma/enums";
import { fetchJson } from "./http";
import type { ConnectorContext, ConnectorQuery, JobConnector, NormalizedJob } from "./types";

const API_BASE = "https://portal.gupy.io/api/job-search/jobs";
const API_HOST = "portal.gupy.io";
const PER_PAGE = 100; // máximo do servidor
const MAX_PAGES_PER_KEYWORD = 3;
/** No máximo estas palavras-chave por coleta: cada uma é uma busca independente. */
const MAX_KEYWORDS = 6;
/** Teto de requisições por coleta, mesmo com várias palavras-chave. */
const MAX_REQUESTS = 6;
const EARLY_STOP_MARGIN_MS = 2 * 86_400_000;

const CONFIDENTIAL_EMPLOYER = /^(?:empresa\s+)?confidencial$/i;

const WORKPLACE_PARAM: Record<WorkMode, string> = { REMOTE: "remote", HYBRID: "hybrid", ONSITE: "on-site" };
const WORKPLACE_TO_MODE: Record<string, WorkMode> = { remote: "REMOTE", hybrid: "HYBRID", "on-site": "ONSITE" };

/** Rótulos em português dos tipos de contratação da Gupy (valores desconhecidos passam como vieram). */
const EMPLOYMENT_LABELS: Record<string, string> = {
  vacancy_type_effective: "CLT",
  vacancy_type_internship: "Estágio",
  vacancy_type_apprentice: "Aprendiz",
  vacancy_type_temporary: "Temporário",
  vacancy_type_associate: "Associado",
  vacancy_type_talent_pool: "Banco de talentos",
  vacancy_type_outsource: "Terceirizado",
  vacancy_legal_entity: "PJ",
  vacancy_type_freelance: "Freelancer",
  vacancy_type_autonomous: "Autônomo",
};

type RawGupyJob = Record<string, unknown>;

/** Só aceita https em *.gupy.io. */
export function isSafeGupyUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    return u.protocol === "https:" && (host === "gupy.io" || host.endsWith(".gupy.io"));
  } catch {
    return false;
  }
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** O corpo precisa ser `{ data: [...] }`; qualquer outra coisa é erro explícito. */
export function extractGupyRows(json: unknown, keyword: string, page: number): RawGupyJob[] {
  const rows = json && typeof json === "object" ? (json as { data?: unknown }).data : undefined;
  if (!Array.isArray(rows)) {
    const got =
      json && typeof json === "object" ? `chaves: [${Object.keys(json).join(", ")}]` : `tipo: ${json === null ? "null" : typeof json}`;
    throw new Error(`Gupy: resposta inesperada para "${keyword}" (página ${page}): esperado { data: [...] }, recebido ${got}`);
  }
  return rows as RawGupyJob[];
}

/** Local para exibição: modalidade + cidade, estado e país. */
export function buildGupyLocation(j: RawGupyJob): string {
  const parts: string[] = [];
  const type = str(j.workplaceType);
  if (type) parts.push({ remote: "Remoto", hybrid: "Híbrido", "on-site": "Presencial" }[type] ?? type);
  else if (j.isRemoteWork === true) parts.push("Remoto");
  for (const field of ["city", "state", "country"]) {
    const v = str(j[field]);
    if (v) parts.push(v);
  }
  return parts.join(", ");
}

/** Normaliza uma vaga crua da API; devolve null para vagas inutilizáveis. */
export function normalizeGupyJob(j: unknown): NormalizedJob | null {
  if (!j || typeof j !== "object") return null;
  const raw = j as RawGupyJob;
  if (raw.isConfidentialCareerPage === true) return null;

  const title = str(raw.name);
  if (!title) return null;
  const url = str(raw.jobUrl);
  if (!isSafeGupyUrl(url)) return null;
  const company = str(raw.careerPageName);
  if (!company || CONFIDENTIAL_EMPLOYER.test(company)) return null;

  const type = str(raw.type);
  const workplace = str(raw.workplaceType);
  const published = typeof raw.publishedDate === "string" ? Date.parse(raw.publishedDate) : NaN;
  const externalId = raw.id !== undefined && raw.id !== null && String(raw.id).trim() ? String(raw.id).trim() : undefined;

  const job: NormalizedJob = {
    url,
    title,
    company,
    description: typeof raw.description === "string" ? raw.description : "",
    location: buildGupyLocation(raw),
    country: "BR",
  };
  if (externalId) job.externalId = externalId;
  if (str(raw.city)) job.city = str(raw.city);
  const state = str(raw.state);
  if (state) job.state = state;
  const mode = WORKPLACE_TO_MODE[workplace] ?? (raw.isRemoteWork === true ? "REMOTE" : undefined);
  if (mode) job.workMode = mode;
  if (type) job.employmentType = EMPLOYMENT_LABELS[type] ?? type;
  if (type === "vacancy_type_internship") job.seniority = "INTERN";
  if (!Number.isNaN(published)) job.publishedAt = new Date(published);
  return job;
}

/** True quando a página inteira está além da janela `since` (o feed é do mais novo ao mais antigo). */
export function pageIsPastWindow(jobs: NormalizedJob[], cutoffMs: number | null): boolean {
  if (cutoffMs === null) return false;
  const dated = jobs.map((j) => j.publishedAt?.getTime()).filter((t): t is number => typeof t === "number");
  if (dated.length === 0) return false;
  return Math.min(...dated) < cutoffMs - EARLY_STOP_MARGIN_MS;
}

export function buildGupyUrl(keyword: string, page: number, workModes?: WorkMode[]): string {
  const params = new URLSearchParams({
    jobName: keyword,
    offset: String(page * PER_PAGE),
    limit: String(PER_PAGE),
  });
  const modes = (workModes ?? []).map((m) => WORKPLACE_PARAM[m]);
  if (modes.length > 0) params.set("workplaceType", modes.join(","));
  return `${API_BASE}?${params}`;
}

async function search(query: ConnectorQuery, ctx: ConnectorContext): Promise<NormalizedJob[]> {
  if (query.country && query.country.toUpperCase() !== "BR") return []; // plataforma brasileira
  const keywords: string[] = [];
  for (const k of query.keywords.map((w) => w.trim()).filter(Boolean)) {
    if (!keywords.some((x) => x.toLowerCase() === k.toLowerCase())) keywords.push(k); // "React" e "react" são uma busca só
  }
  keywords.splice(MAX_KEYWORDS);
  if (keywords.length === 0) throw new Error("Gupy: nenhuma palavra-chave para buscar.");

  const max = query.maxResults ?? 200;
  const cutoffMs = query.since ? query.since.getTime() : null;
  const seen = new Set<string>();
  const out: NormalizedJob[] = [];
  let requests = 0;
  let firstError: unknown = null;
  let succeeded = false;

  // Página 0 de TODAS as palavras-chave primeiro; só depois a página 1 das que vieram cheias, e assim por diante.
  // Com o teto de MAX_REQUESTS, nenhum termo fica sem busca por causa de outro que tem muitas páginas.
  const finished = new Set<string>();
  outer: for (let page = 0; page < MAX_PAGES_PER_KEYWORD; page++) {
    for (const keyword of keywords) {
      if (finished.has(keyword)) continue;
      if (out.length >= max || requests >= MAX_REQUESTS || ctx.signal?.aborted) break outer;
      if (requests > 0) await ctx.sleep(ctx.requestDelayMs);
      requests++;

      let rows: RawGupyJob[];
      try {
        rows = extractGupyRows(await fetchJson(ctx, buildGupyUrl(keyword, page, query.workModes)), keyword, page);
      } catch (err) {
        // Uma busca que falha para; as demais continuam (e a coleta vira PARCIAL).
        firstError ??= err;
        finished.add(keyword);
        ctx.log(`Gupy: busca "${keyword}" interrompida na página ${page}: ${(err as Error).message}`, { level: "warn" });
        continue;
      }
      succeeded = true;

      const pageJobs: NormalizedJob[] = [];
      for (const raw of rows) {
        const job = normalizeGupyJob(raw);
        if (!job) continue;
        job.sourceKeyword = keyword;
        pageJobs.push(job);
        if (seen.has(job.url)) continue;
        seen.add(job.url);
        if (cutoffMs !== null && job.publishedAt && job.publishedAt.getTime() < cutoffMs) continue;
        if (out.length < max) out.push(job);
      }

      if (rows.length < PER_PAGE) finished.add(keyword); // página curta = fim do feed
      else if (pageIsPastWindow(pageJobs, cutoffMs)) finished.add(keyword);
    }
  }

  // Nenhuma busca teve sucesso: é uma queda ou mudança de API, não "zero vagas".
  if (!succeeded && firstError) throw firstError;
  return out;
}

export const gupyConnector: JobConnector = {
  slug: "gupy",
  allowedHosts: [API_HOST],
  search,
};
