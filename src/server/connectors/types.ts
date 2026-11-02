/**
 * Contrato comum para todos os conectores de vagas (Fase 2).
 *
 * Cada fonte (Gupy, Remotive, Greenhouse…) implementa `JobConnector`
 * e devolve vagas já normalizadas. Deduplicação, persistência e
 * registro em ScanRun ficam fora do conector, no worker de ingestão.
 */
import type { Seniority, WorkMode } from "@/generated/prisma/enums";

export interface ConnectorQuery {
  keywords: string[]; // ex.: ["react", "front-end", "frontend"]
  country?: string; // "BR"
  workModes?: WorkMode[];
  maxResults?: number;
  since?: Date; // só vagas publicadas depois desta data
}

export interface NormalizedJob {
  externalId?: string;
  url: string;
  title: string;
  company: string;
  description: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  workMode?: WorkMode;
  seniority?: Seniority;
  salaryMin?: number; // centavos
  salaryMax?: number;
  salaryCurrency?: string;
  employmentType?: string;
  tags?: string[];
  publishedAt?: Date;
}

export interface ConnectorContext {
  /** fetch com timeout, retry e respeito a Retry-After */
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  /** pausa entre requisições, conforme JobSource.requestDelayMs */
  sleep: (ms: number) => Promise<void>;
  log: (message: string, meta?: Record<string, unknown>) => void;
  signal?: AbortSignal;
}

export interface JobConnector {
  /** igual a JobSource.slug */
  slug: string;
  search(query: ConnectorQuery, ctx: ConnectorContext): Promise<NormalizedJob[]>;
}
