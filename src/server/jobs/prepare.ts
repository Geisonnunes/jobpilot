import type { Seniority, WorkMode } from "@/generated/prisma/enums";
import type { NormalizedJob } from "@/server/connectors/types";
import { canonicalUrl } from "./canonical-url";
import { contentHash } from "./content-hash";
import { inferSeniority, inferWorkMode } from "./infer";
import { htmlToText } from "./text";

/** Vaga já limpa, pronta para o banco. */
export interface PreparedJob {
  externalId: string | null;
  canonicalUrl: string;
  originalUrl: string;
  contentHash: string;
  title: string;
  company: string;
  description: string;
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  workMode: WorkMode | null;
  seniority: Seniority | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  employmentType: string | null;
  tags: string[];
  publishedAt: Date | null;
}

const oneLine = (v: string | undefined, max: number) => {
  const t = htmlToText(v ?? "", max).replace(/\s+/g, " ").trim();
  return t || null;
};

/**
 * Normaliza uma vaga de qualquer origem: texto puro, URL canônica, hash e
 * inferência de senioridade/modalidade quando a fonte não informou.
 * Devolve null se faltar URL válida, título ou empresa.
 */
export function prepareJob(job: NormalizedJob): PreparedJob | null {
  const canonical = canonicalUrl(job.url);
  const title = oneLine(job.title, 300);
  const company = oneLine(job.company, 200);
  if (!canonical || !title || !company) return null;

  const description = htmlToText(job.description);
  const location = oneLine(job.location, 200);
  return {
    externalId: job.externalId?.trim() || null,
    canonicalUrl: canonical,
    originalUrl: job.url.trim().slice(0, 2048),
    contentHash: contentHash({ company, title, description }),
    title,
    company,
    description,
    location,
    city: oneLine(job.city, 120),
    state: oneLine(job.state, 60),
    country: oneLine(job.country, 8),
    workMode: job.workMode ?? inferWorkMode(title, description, location ?? "") ?? null,
    seniority: job.seniority ?? inferSeniority(title, description) ?? null,
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    salaryCurrency: job.salaryCurrency ?? null,
    employmentType: oneLine(job.employmentType, 80),
    tags: (job.tags ?? []).map((t) => oneLine(t, 60)).filter((t): t is string => Boolean(t)).slice(0, 30),
    publishedAt: job.publishedAt ?? null,
  };
}

/** Campos de JobPosting a partir de uma vaga preparada. */
export function toPostingData(p: PreparedJob) {
  return {
    canonicalUrl: p.canonicalUrl,
    originalUrl: p.originalUrl,
    contentHash: p.contentHash,
    title: p.title,
    company: p.company,
    description: p.description,
    location: p.location,
    city: p.city,
    state: p.state,
    country: p.country,
    workMode: p.workMode,
    seniority: p.seniority,
    salaryMin: p.salaryMin,
    salaryMax: p.salaryMax,
    salaryCurrency: p.salaryCurrency,
    employmentType: p.employmentType,
    tags: p.tags,
    publishedAt: p.publishedAt,
  };
}
